#pragma once
// HOST-ONLY protobuf-message stub — see hostcheck/stubs/dbus-cxx.h header comment.
#include <google/protobuf/message_lite.h>
#include <string>
#include <cstdint>

class WifiStartRequest : public google::protobuf::MessageLite {
public:
    void set_ip_address(const std::string&) {}
    void set_port(int32_t) {}
};
