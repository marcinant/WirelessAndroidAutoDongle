#include <cstdlib>
#include <cstdarg>
#include <sstream>
#include <fstream>
#include <syslog.h>

#include "common.h"
#include "proto/WifiInfoResponse.pb.h"

#pragma region Config
/*static*/ Config* Config::instance() {
    static Config s_instance;
    return &s_instance;
}

int32_t Config::getenv(std::string name, int32_t defaultValue) {
    char* envValue = std::getenv(name.c_str());
    try {
        return envValue != nullptr ? std::stoi(envValue) : defaultValue;
    }
    catch(...) {
        return defaultValue;
    }
}

std::string Config::getenv(std::string name, std::string defaultValue) {
    char* envValue = std::getenv(name.c_str());
    return envValue != nullptr ? envValue : defaultValue;
}

std::string Config::getMacAddress(std::string interface) {
    std::ifstream addressFile("/sys/class/net/" + interface + "/address");

    std::string macAddress;
    getline(addressFile, macAddress);

    return macAddress;
}

std::string Config::getUniqueSuffix() {
    std::string uniqueSuffix = getenv("AAWG_UNIQUE_NAME_SUFFIX", "");
    if (!uniqueSuffix.empty()) {
        return uniqueSuffix;
    }

#ifdef AAWG_BUILD_HASH
    // Short git hash of the image build, passed in by aawg.mk. Identifies the
    // firmware version right in the bluetooth name; device serial is only the
    // fallback for builds made outside the git tree.
    if (std::string(AAWG_BUILD_HASH).length() == 6) {
        return AAWG_BUILD_HASH;
    }
#endif

    std::ifstream serialNumberFile("/sys/firmware/devicetree/base/serial-number");

    std::string serialNumber;
    getline(serialNumberFile, serialNumber);

    // Removing trailing null from serialNumber, pad at the beginning
    serialNumber = std::string("00000000") + serialNumber.c_str();

    return serialNumber.substr(serialNumber.size() - 6);
}

WifiInfo Config::getWifiInfo() {
    return {
        getenv("AAWG_WIFI_SSID", "AAWirelessDongle"),
        getenv("AAWG_WIFI_PASSWORD", "ConnectAAWirelessDongle"),
        getenv("AAWG_WIFI_BSSID", getMacAddress("wlan0")),
        SecurityMode::WPA2_PERSONAL,
        AccessPointType::DYNAMIC,
        getenv("AAWG_PROXY_IP_ADDRESS", "10.0.0.1"),
        getenv("AAWG_PROXY_PORT", 5288),
    };
}

ConnectionStrategy Config::getConnectionStrategy() {
    // Function-local static: C++11 guarantees its initialization is thread-safe
    // and happens exactly once, even if several threads race the first call.
    static const ConnectionStrategy strategy = [this]() {
        const int32_t connectionStrategyEnv = getenv("AAWG_CONNECTION_STRATEGY", 1);

        switch (connectionStrategyEnv) {
            case 0:
                return ConnectionStrategy::DONGLE_MODE;
            case 2:
                return ConnectionStrategy::USB_FIRST;
            case 1:
            default:
                return ConnectionStrategy::PHONE_FIRST;
        }
    }();

    return strategy;
}

bool Config::earlyHspRelease() {
    // When enabled (default), the fake HSP handset link is disconnected as soon
    // as the phone opens the AA Wireless channel. The handset is only needed as
    // the wake-up trigger for wireless Android Auto; dropping it right away
    // frees the phone's hands-free/call profile for the car's own bluetooth
    // seconds earlier than waiting for the full bluetooth power-off.
    static const bool enabled = (getenv("AAWG_EARLY_HSP_RELEASE", 1) != 0);
    return enabled;
}

bool Config::isHspDisabled() {
    // When set, the dongle does not register or connect the fake HSP Handset
    // profile. Without it the dongle never occupies the phone's hands-free/call
    // profile, so the car's own HFP (e.g. Audi MMI) stays connectable for phone
    // calls. Some phones need the fake handset to trigger wireless Android Auto,
    // so this is opt-in. Default 0 (HSP enabled, original behaviour).
    static const bool disabled = (getenv("AAWG_DISABLE_HSP", 0) != 0);
    return disabled;
}
#pragma endregion Config

#pragma region Logger
/*static*/ Logger* Logger::instance() {
    static Logger s_instance;
    return &s_instance;
}

Logger::Logger() {
    openlog(nullptr, LOG_PERROR | LOG_PID, LOG_USER);
}

Logger::~Logger() {
    closelog();
}

void Logger::info(const char *format, ...) {
    va_list args;
    va_start(args, format);
    vsyslog(LOG_INFO, format, args);
    va_end(args);
}
#pragma endregion Logger