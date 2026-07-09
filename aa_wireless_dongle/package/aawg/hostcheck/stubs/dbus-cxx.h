#pragma once
// ---------------------------------------------------------------------------
// HOST-ONLY permissive stub of dbus-cxx (dbus-cxx-2.0).
// Purpose: let `g++ -fsyntax-only` parse the aawg sources on a dev machine
// that does NOT have dbus-cxx installed, so C++ typos are caught locally.
// This is NOT a functional implementation and MUST NOT be used for real
// builds — the Buildroot cross-compile uses the genuine headers.
// ---------------------------------------------------------------------------
#include <string>
#include <map>
#include <vector>
#include <memory>
#include <cstdint>
#include <functional>

namespace sigc {
    // create_method(..., sigc::mem_fun(*this, &X::Y)) — return type is opaque;
    // callers only forward it, so an empty functor is enough to parse.
    template<typename Obj, typename Method>
    inline std::function<void()> mem_fun(Obj&, Method) { return {}; }
}

namespace DBus {
    using Path = std::string;

    struct Variant {
        Variant() {}
        template<typename T> Variant(const T&) {}
    };

    struct FileDescriptor {
        int descriptor() const { return -1; }
    };

    enum class BusType { SESSION, SYSTEM };
    enum class ThreadForCalling { DispatcherThread, CurrentThread };
    enum class RegistrationStatus { Success, Failed };
    enum class PropertyAccess { ReadOnly, ReadWrite };

    struct Error {
        const char* what() const { return "stub-dbus-error"; }
    };

    // ---- MethodProxy<Sig> ----------------------------------------------------
    template<typename Sig> class MethodProxy;
    template<typename R, typename... A>
    class MethodProxy<R(A...)> {
    public:
        R operator()(A...) const { return R(); }
    };
    // Support CTAD: `DBus::MethodProxy m = *methodProxyPtr;`
    template<typename R, typename... A>
    MethodProxy(MethodProxy<R(A...)>) -> MethodProxy<R(A...)>;

    // ---- PropertyProxy<T> (remote object) ------------------------------------
    template<typename T>
    class PropertyProxy {
    public:
        void set_value(const T&) {}
        T value() const { return T(); }
    };

    // ---- Property<T> (exported/local object) ---------------------------------
    template<typename T>
    class Property {
    public:
        void set_value(const T&) {}
        T value() const { return T(); }
    };

    // ---- Object (exported/local D-Bus object base) ---------------------------
    class Object {
    public:
        Object(Path) {}
        virtual ~Object() {}
        template<typename Sig, typename... Rest>
        std::shared_ptr<MethodProxy<Sig>> create_method(const std::string&, const std::string&, Rest&&...) {
            return std::make_shared<MethodProxy<Sig>>();
        }
        template<typename T, typename... Rest>
        std::shared_ptr<Property<T>> create_property(const std::string&, const std::string&, Rest&&...) {
            return std::make_shared<Property<T>>();
        }
    };

    // ---- ObjectProxy (remote object) -----------------------------------------
    class Connection;
    class ObjectProxy {
    public:
        ObjectProxy(std::shared_ptr<Connection>, const std::string&, Path) {}
        virtual ~ObjectProxy() {}
        template<typename Sig, typename... Rest>
        std::shared_ptr<MethodProxy<Sig>> create_method(const std::string&, const std::string&, Rest&&...) {
            return std::make_shared<MethodProxy<Sig>>();
        }
        template<typename T, typename... Rest>
        std::shared_ptr<PropertyProxy<T>> create_property(const std::string&, const std::string&, Rest&&...) {
            return std::make_shared<PropertyProxy<T>>();
        }
    };

    class Connection {
    public:
        std::shared_ptr<ObjectProxy> create_object_proxy(const std::string&, const Path&) {
            return std::make_shared<ObjectProxy>(nullptr, std::string(), Path());
        }
        template<typename T>
        RegistrationStatus register_object(std::shared_ptr<T>, ThreadForCalling) {
            return RegistrationStatus::Success;
        }
    };

    class Dispatcher {
    public:
        virtual ~Dispatcher() {}
        std::shared_ptr<Connection> create_connection(BusType) {
            return std::make_shared<Connection>();
        }
    };

    class StandaloneDispatcher : public Dispatcher {
    public:
        static std::shared_ptr<StandaloneDispatcher> create() {
            return std::make_shared<StandaloneDispatcher>();
        }
    };
}
