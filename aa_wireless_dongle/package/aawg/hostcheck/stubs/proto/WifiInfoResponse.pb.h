#pragma once
// HOST-ONLY protobuf-message stub — see hostcheck/stubs/dbus-cxx.h header comment.
// Also provides the SecurityMode / AccessPointType enums that common.h only
// forward-declares (the genuine ones live in the generated proto header).
#include <google/protobuf/message_lite.h>
#include <string>

enum SecurityMode : int {
    UNKNOWN_SECURITY_MODE = 0,
    WPA2_PERSONAL = 8,
};

enum AccessPointType : int {
    STATIC = 0,
    DYNAMIC = 1,
};

class WifiInfoResponse : public google::protobuf::MessageLite {
public:
    void set_ssid(const std::string&) {}
    void set_key(const std::string&) {}
    void set_bssid(const std::string&) {}
    void set_security_mode(SecurityMode) {}
    void set_access_point_type(AccessPointType) {}
};
