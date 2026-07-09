#pragma once
// HOST-ONLY protobuf stub — see hostcheck/stubs/dbus-cxx.h header comment.
#include <cstddef>

namespace google {
namespace protobuf {
class MessageLite {
public:
    virtual ~MessageLite() {}
    std::size_t ByteSizeLong() const { return 0; }
    bool SerializeToArray(void*, int) const { return true; }
};
}
}
