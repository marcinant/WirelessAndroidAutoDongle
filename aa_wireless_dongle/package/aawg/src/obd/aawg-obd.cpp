// aawg-obd: log OBD-II data from a Bluetooth ELM327 adapter, on the dongle.
//
// The dongle's own Bluetooth radio connects to a classic-BT ELM327 plugged
// into the car's OBD-II port (the adapter is wireless, so it can sit under the
// dash while the dongle stays at the head-unit USB). Readings are appended to
// /persist/aawg/obd.log and to a small "latest" snapshot; aawg-cloudsync ships
// them to Home Assistant over the phone's mobile data.
//
// IMPORTANT: this shares the single BT radio with the Android Auto link. It is
// off by default (S48obd only starts it when AAWG_OBD_ENABLE=1 and an adapter
// MAC is set) and polls at a low rate to keep airtime off the AA connection.
//
// Standalone: opens a raw RFCOMM socket to the adapter (channel configurable,
// default 1) and speaks the ELM327 line protocol. No D-Bus, no aawgd coupling.

#include <bluetooth/bluetooth.h>
#include <bluetooth/rfcomm.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <cctype>
#include <cerrno>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <string>
#include <vector>
#include <map>
#include <optional>
#include <chrono>
#include <thread>

namespace {

const char* getenv_str(const char* key, const char* def) {
    const char* v = getenv(key);
    return (v && *v) ? v : def;
}

int getenv_int(const char* key, int def) {
    const char* v = getenv(key);
    if (!v || !*v) return def;
    char* end = nullptr;
    long n = strtol(v, &end, 10);
    return (end && *end == '\0') ? static_cast<int>(n) : def;
}

void log_line(const char* fmt, ...) {
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    fprintf(stderr, "aawg-obd: %s\n", buf);
}

// A single mode-01 PID we poll, with a parser producing a scaled value.
struct Pid {
    std::string key;
    std::string cmd;    // e.g. "010C"
    uint8_t pidByte;    // e.g. 0x0C
    double (*parse)(const std::vector<int>&);
};

double p_rpm(const std::vector<int>& b)      { return b.size() >= 2 ? (b[0] * 256 + b[1]) / 4.0 : NAN; }
double p_speed(const std::vector<int>& b)    { return b.size() >= 1 ? b[0] : NAN; }
double p_coolant(const std::vector<int>& b)  { return b.size() >= 1 ? b[0] - 40 : NAN; }
double p_load(const std::vector<int>& b)     { return b.size() >= 1 ? b[0] * 100.0 / 255 : NAN; }
double p_maf(const std::vector<int>& b)      { return b.size() >= 2 ? (b[0] * 256 + b[1]) / 100.0 : NAN; }
double p_throttle(const std::vector<int>& b) { return b.size() >= 1 ? b[0] * 100.0 / 255 : NAN; }
double p_voltage(const std::vector<int>& b)  { return b.size() >= 2 ? (b[0] * 256 + b[1]) / 1000.0 : NAN; }
double p_fuellvl(const std::vector<int>& b)  { return b.size() >= 1 ? b[0] * 100.0 / 255 : NAN; }
double p_intake(const std::vector<int>& b)   { return b.size() >= 1 ? b[0] - 40 : NAN; }

const std::vector<Pid> ALL_PIDS = {
    {"rpm",       "010C", 0x0C, p_rpm},
    {"speed",     "010D", 0x0D, p_speed},
    {"coolant",   "0105", 0x05, p_coolant},
    {"load",      "0104", 0x04, p_load},
    {"maf",       "0110", 0x10, p_maf},
    {"throttle",  "0111", 0x11, p_throttle},
    {"voltage",   "0142", 0x42, p_voltage},
    {"fuel_level","012F", 0x2F, p_fuellvl},
    {"intake",    "010F", 0x0F, p_intake},
};

int g_fd = -1;

bool connect_rfcomm(const char* mac, int channel) {
    g_fd = socket(AF_BLUETOOTH, SOCK_STREAM, BTPROTO_RFCOMM);
    if (g_fd < 0) {
        log_line("socket() failed: %s", strerror(errno));
        return false;
    }
    struct sockaddr_rc addr = {};
    addr.rc_family = AF_BLUETOOTH;
    addr.rc_channel = static_cast<uint8_t>(channel);
    str2ba(mac, &addr.rc_bdaddr);

    if (connect(g_fd, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
        log_line("connect(%s ch %d) failed: %s", mac, channel, strerror(errno));
        close(g_fd);
        g_fd = -1;
        return false;
    }

    struct timeval tv = { .tv_sec = 2, .tv_usec = 0 };
    setsockopt(g_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    return true;
}

void disconnect_rfcomm() {
    if (g_fd >= 0) { close(g_fd); g_fd = -1; }
}

// Send a command (CR appended) and read until the ELM327 ">" prompt or timeout.
std::optional<std::string> command(const std::string& cmd, int timeout_ms) {
    std::string out = cmd + "\r";
    if (write(g_fd, out.c_str(), out.size()) < 0) return std::nullopt;

    std::string resp;
    char buf[256];
    auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
    while (std::chrono::steady_clock::now() < deadline) {
        ssize_t n = read(g_fd, buf, sizeof(buf));
        if (n > 0) {
            resp.append(buf, n);
            if (resp.find('>') != std::string::npos) break;
        } else if (n == 0) {
            return std::nullopt; // closed
        } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
            return std::nullopt;
        }
    }
    return resp;
}

// Pull the data bytes after the "41<pid>" response header out of a raw reply.
std::optional<std::vector<int>> parse_data(const std::string& raw, uint8_t pidByte) {
    std::string hex;
    for (char c : raw) {
        if (isxdigit(static_cast<unsigned char>(c))) hex += toupper(c);
    }
    char header[5];
    snprintf(header, sizeof(header), "41%02X", pidByte);
    size_t i = hex.find(header);
    if (i == std::string::npos) return std::nullopt;
    std::string body = hex.substr(i + 4);
    std::vector<int> bytes;
    for (size_t j = 0; j + 1 < body.size(); j += 2) {
        bytes.push_back(static_cast<int>(strtol(body.substr(j, 2).c_str(), nullptr, 16)));
    }
    return bytes;
}

bool elm_init() {
    // Reset then quiet the interface: echo off, linefeeds off, headers off,
    // automatic protocol. Probe with 0100.
    if (!command("ATZ", 3000)) return false;
    for (const char* c : {"ATE0", "ATL0", "ATH0", "ATSP0"}) {
        if (!command(c, 1500)) return false;
    }
    command("0100", 3000);
    return true;
}

volatile bool g_run = true;

} // namespace

int main() {
    const char* mac = getenv_str("AAWG_OBD_MAC", "");
    if (!mac[0]) {
        log_line("AAWG_OBD_MAC not set, nothing to do");
        return 0;
    }
    int channel = getenv_int("AAWG_OBD_CHANNEL", 1);
    int interval = getenv_int("AAWG_OBD_INTERVAL", 5);
    if (interval < 2) interval = 2;

    const char* dir = "/persist/aawg";
    std::string logpath = std::string(dir) + "/obd.log";
    std::string latestpath = std::string(dir) + "/obd-latest";
    mkdir(dir, 0755);

    log_line("starting: adapter %s ch %d, every %ds", mac, channel, interval);

    while (g_run) {
        if (g_fd < 0) {
            if (!connect_rfcomm(mac, channel)) {
                std::this_thread::sleep_for(std::chrono::seconds(30));
                continue;
            }
            if (!elm_init()) {
                log_line("ELM327 init failed, retrying");
                disconnect_rfcomm();
                std::this_thread::sleep_for(std::chrono::seconds(15));
                continue;
            }
            log_line("connected to adapter");
        }

        // One poll round.
        std::map<std::string, double> readings;
        bool link_ok = true;
        for (const Pid& pid : ALL_PIDS) {
            auto raw = command(pid.cmd, 1200);
            if (!raw) { link_ok = false; break; }
            auto bytes = parse_data(*raw, pid.pidByte);
            if (bytes) {
                double v = pid.parse(*bytes);
                if (!std::isnan(v)) readings[pid.key] = v;
            }
        }
        if (!link_ok) {
            log_line("link error, reconnecting");
            disconnect_rfcomm();
            std::this_thread::sleep_for(std::chrono::seconds(5));
            continue;
        }

        if (!readings.empty()) {
            time_t now = time(nullptr);
            // Append timestamped CSV line and rewrite the latest snapshot
            // (key=value per line) that cloud-sync reads.
            FILE* lf = fopen(logpath.c_str(), "a");
            FILE* sf = fopen(latestpath.c_str(), "w");
            if (lf) fprintf(lf, "%ld", static_cast<long>(now));
            if (sf) fprintf(sf, "epoch=%ld\n", static_cast<long>(now));
            for (const auto& [k, v] : readings) {
                if (lf) fprintf(lf, ",%s=%.2f", k.c_str(), v);
                if (sf) fprintf(sf, "%s=%.2f\n", k.c_str(), v);
            }
            if (lf) { fprintf(lf, "\n"); fclose(lf); }
            if (sf) fclose(sf);
        }

        std::this_thread::sleep_for(std::chrono::seconds(interval));
    }

    disconnect_rfcomm();
    return 0;
}
