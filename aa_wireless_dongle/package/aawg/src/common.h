#pragma once

#include <string>
#include <cstdint>
#include <optional>

enum SecurityMode: int;
enum AccessPointType: int;

struct WifiInfo {
    std::string ssid;
    std::string key;
    std::string bssid;
    SecurityMode securityMode;
    AccessPointType accessPointType;
    std::string ipAddress;
    int32_t port;
};

enum class ConnectionStrategy {
    DONGLE_MODE = 0,
    PHONE_FIRST = 1,
    USB_FIRST = 2
};

class Config {
public:
    static Config* instance();

    WifiInfo getWifiInfo();
    ConnectionStrategy getConnectionStrategy();
    bool isHspDisabled();
    bool earlyHspRelease();

    std::string getUniqueSuffix();
private:
    Config() = default;

    int32_t getenv(std::string name, int32_t defaultValue);
    std::string getenv(std::string name, std::string defaultValue);

    std::string getMacAddress(std::string interface);
};

class Logger {
public:
    static Logger* instance();

    // format(printf, 2, 3): implicit `this` is arg 1, so the format string is
    // arg 2 and the varargs start at arg 3. Lets the compiler catch mismatches.
    void info(const char *format, ...) __attribute__((format(printf, 2, 3)));
private:
    Logger();
    ~Logger();
};