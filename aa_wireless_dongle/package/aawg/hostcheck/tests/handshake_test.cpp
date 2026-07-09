// ---------------------------------------------------------------------------
// HOST-ONLY unit test for the AAWirelessLauncher wifi handshake state machine
// (bluetoothProfiles.cpp). Runs entirely on a dev PC — no Bluetooth, no Pi, no
// car. It drives the real launch() code over a socketpair() while a scripted
// "phone" feeds message sequences, verifying the tolerant handshake introduced
// to fix issues #302 (phone jumps straight to WifiStartResponse) and friends.
//
// It includes the .cpp directly to reach the file-private AAWirelessLauncher,
// and supplies minimal Config/Logger definitions so no real BlueZ/protobuf is
// needed (the stub protobuf serialises empty bodies, which is fine: this test
// exercises framing + message ordering, not payload contents).
//
// Build/run:  hostcheck/tests/run-tests.sh
// ---------------------------------------------------------------------------
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>
#include <thread>
#include <vector>

#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

// Pull in the real handshake implementation (and its private launcher).
#include "bluetoothProfiles.cpp"

// --- Minimal Config/Logger so the linked-in source has definitions ----------
static WifiInfo g_wifiInfo = {
    /*ssid*/ "AAWirelessDongle",
    /*key*/ "password123",
    /*bssid*/ "b8:27:eb:00:00:00",
    /*securityMode*/ WPA2_PERSONAL,
    /*accessPointType*/ DYNAMIC,
    /*ipAddress*/ "10.0.0.1",
    /*port*/ 5288,
};

Config* Config::instance() { static Config c; return &c; }
WifiInfo Config::getWifiInfo() { return g_wifiInfo; }

Logger* Logger::instance() { static Logger l; return &l; }
Logger::Logger() {}
Logger::~Logger() {}
void Logger::info(const char* format, ...) {
    // Prefix so daemon log lines are visually separate from test output.
    fputs("      [aawgd] ", stdout);
    va_list args;
    va_start(args, format);
    vprintf(format, args);
    va_end(args);
}

// --- Wire format helpers (mirror SendMessage/ReadMessage framing) -----------
// Frame: [uint16 bodyLen][uint16 messageId][body...], all network byte order.
// Scoped so these do not collide with the stub proto classes of the same names
// (class WifiStartRequest / WifiInfoResponse live in the -I stubs headers).
enum class PhoneMsg : uint16_t {
    WifiStartRequest = 1,
    WifiInfoRequest = 2,
    WifiInfoResponse = 3,
    WifiVersionRequest = 4,
    WifiVersionResponse = 5,
    WifiConnectStatus = 6,
    WifiStartResponse = 7,
};
static constexpr int msgId(PhoneMsg m) { return static_cast<int>(m); }

static bool writeAll(int fd, const unsigned char* buf, size_t len) {
    size_t total = 0;
    while (total < len) {
        ssize_t w = write(fd, buf + total, len - total);
        if (w <= 0) return false;
        total += (size_t)w;
    }
    return true;
}

static bool readAll(int fd, unsigned char* buf, size_t len) {
    size_t total = 0;
    while (total < len) {
        ssize_t r = read(fd, buf + total, len - total);
        if (r <= 0) return false;
        total += (size_t)r;
    }
    return true;
}

// Phone -> dongle: send an (empty-body) message of the given id.
static bool phoneSend(int fd, PhoneMsg id) {
    unsigned char hdr[4];
    uint16_t n = htons(0);
    memcpy(hdr, &n, 2);
    n = htons(static_cast<uint16_t>(id));
    memcpy(hdr + 2, &n, 2);
    return writeAll(fd, hdr, 4);
}

// Dongle -> phone: read one message id, discarding any body. Returns -1 on
// error/EOF/timeout.
static int phoneRecv(int fd) {
    unsigned char hdr[4];
    if (!readAll(fd, hdr, 4)) return -1;
    uint16_t bodyLen, id;
    memcpy(&bodyLen, hdr, 2);
    memcpy(&id, hdr + 2, 2);
    bodyLen = ntohs(bodyLen);
    id = ntohs(id);
    if (bodyLen > 0) {
        std::vector<unsigned char> body(bodyLen);
        if (!readAll(fd, body.data(), bodyLen)) return -1;
    }
    return (int)id;
}

// --- Test harness -----------------------------------------------------------
static int g_failures = 0;

struct PhoneResult {
    std::vector<int> received;  // ids the phone saw from the dongle
    bool completed = false;     // launch() returned (handshake didn't hang)
};

// Runs launch() on one socket end in a thread; `phoneScript` drives the other
// end. `phoneScript` receives the phone fd and the result to fill in.
static PhoneResult runScenario(const std::function<void(int, PhoneResult&)>& phoneScript) {
    int sv[2];
    socketpair(AF_UNIX, SOCK_STREAM, 0, sv);
    int dongleFd = sv[0];
    int phoneFd = sv[1];

    // Bound phone-side reads so a broken state machine cannot hang the test.
    struct timeval tv = {.tv_sec = 5, .tv_usec = 0};
    setsockopt(phoneFd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    PhoneResult result;
    std::thread dongle([dongleFd]() {
        AAWirelessLauncher(dongleFd).launch();
    });

    phoneScript(phoneFd, result);

    dongle.join();  // launch() is bounded (SO_RCVTIMEO + 8-message cap)
    result.completed = true;

    close(dongleFd);
    close(phoneFd);
    return result;
}

static int countId(const std::vector<int>& v, int id) {
    int c = 0;
    for (int x : v) if (x == id) c++;
    return c;
}

static void check(const char* name, bool cond) {
    printf("  %s %s\n", cond ? "PASS" : "FAIL", name);
    if (!cond) g_failures++;
}

int main() {
    // Scenario 1: normal order (2 -> 3 -> 7).
    printf("Scenario 1: normal handshake (WifiInfoRequest first)\n");
    {
        PhoneResult r = runScenario([](int fd, PhoneResult& res) {
            res.received.push_back(phoneRecv(fd));   // expect WifiStartRequest(1)
            phoneSend(fd, PhoneMsg::WifiInfoRequest);
            res.received.push_back(phoneRecv(fd));   // expect WifiInfoResponse(3)
            phoneSend(fd, PhoneMsg::WifiStartResponse);
            phoneSend(fd, PhoneMsg::WifiConnectStatus);
        });
        check("dongle sent WifiStartRequest first", !r.received.empty() && r.received[0] == msgId(PhoneMsg::WifiStartRequest));
        check("dongle sent exactly one WifiInfoResponse", countId(r.received, msgId(PhoneMsg::WifiInfoResponse)) == 1);
        check("handshake completed (no hang)", r.completed);
    }

    // Scenario 2: issue #302 — phone jumps straight to WifiStartResponse(7).
    printf("Scenario 2: #302 phone sends WifiStartResponse before asking\n");
    {
        PhoneResult r = runScenario([](int fd, PhoneResult& res) {
            res.received.push_back(phoneRecv(fd));   // expect WifiStartRequest(1)
            phoneSend(fd, PhoneMsg::WifiStartResponse);  // no WifiInfoRequest at all
            res.received.push_back(phoneRecv(fd));   // expect proactive WifiInfoResponse(3)
        });
        check("dongle sent WifiStartRequest first", !r.received.empty() && r.received[0] == msgId(PhoneMsg::WifiStartRequest));
        check("dongle sent WifiInfoResponse proactively", countId(r.received, msgId(PhoneMsg::WifiInfoResponse)) == 1);
        check("handshake completed instead of aborting", r.completed);
    }

    // Scenario 3: WifiVersionRequest interleaved before the real request.
    printf("Scenario 3: WifiVersionRequest interleaved\n");
    {
        PhoneResult r = runScenario([](int fd, PhoneResult& res) {
            res.received.push_back(phoneRecv(fd));   // expect WifiStartRequest(1)
            phoneSend(fd, PhoneMsg::WifiVersionRequest);  // unexpected id, must be tolerated
            phoneSend(fd, PhoneMsg::WifiInfoRequest);
            res.received.push_back(phoneRecv(fd));   // expect WifiInfoResponse(3)
            phoneSend(fd, PhoneMsg::WifiConnectStatus);
        });
        check("dongle tolerated WifiVersionRequest", r.completed);
        check("dongle sent exactly one WifiInfoResponse", countId(r.received, msgId(PhoneMsg::WifiInfoResponse)) == 1);
    }

    printf("\n%s (%d failure%s)\n", g_failures == 0 ? "ALL PASS" : "FAILURES",
           g_failures, g_failures == 1 ? "" : "s");
    return g_failures == 0 ? 0 : 1;
}
