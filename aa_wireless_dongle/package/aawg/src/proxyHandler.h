#pragma once

#include <atomic>
#include <optional>
#include <thread>
#include <mutex>
#include <pthread.h>

class AAWProxy {
public:
    std::optional<std::thread> startServer(int32_t port);

private:
    enum class ProxyDirection {
        TCP_to_USB,
        USB_to_TCP
    };

    void handleClient(int server_fd);
    void forward(ProxyDirection direction, std::atomic<bool>& should_exit);
    void stopForwarding(std::atomic<bool>& should_exit);

    ssize_t readFully(int fd, unsigned char *buf, size_t nbyte);
    ssize_t readMessage(int fd, unsigned char *buf, size_t nbyte);

    int m_usb_fd = -1;
    int m_tcp_fd = -1;

    std::optional<std::thread> m_usb_tcp_thread = std::nullopt;
    std::optional<std::thread> m_tcp_usb_thread = std::nullopt;

    // Guards the forward-thread signal handles below. The pthread_t of each
    // forward thread is registered here by the thread itself and cleared on
    // exit, so stopForwarding() never touches the std::thread optionals across
    // threads (those stay owned solely by the main/handleClient thread).
    std::mutex m_threads_mutex;
    std::optional<pthread_t> m_usb_tcp_handle;
    std::optional<pthread_t> m_tcp_usb_handle;

    std::atomic<bool> m_log_communication = false;
};
