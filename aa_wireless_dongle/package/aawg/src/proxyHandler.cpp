#include <stdio.h>
#include <unistd.h>
#include <signal.h>
#include <pthread.h>
#include <fcntl.h>
#include <string.h>
#include <errno.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/poll.h>
#include <thread>
#include <optional>
#include <atomic>
#include <string>
#include <vector>

#include "common.h"
#include "usb.h"
#include "bluetoothHandler.h"
#include "proxyHandler.h"

void empty_signal_handler(int signal) {
    // Empty. We don't want to do anything but interrupt the thread.
}

ssize_t AAWProxy::readFully(int fd, unsigned char *buffer, size_t nbyte) {
    size_t remaining_bytes = nbyte;
    while (remaining_bytes > 0) {
        ssize_t len = read(fd, buffer, remaining_bytes);

        if (len <= 0) {
            // Error, cannot read more.
            return len;
        }

        buffer += len;
        remaining_bytes -= len;
    }

    return nbyte;
}

ssize_t AAWProxy::readMessage(int fd, unsigned char *buffer, size_t buffer_len) {
    size_t header_length = 4;
    if (ssize_t len = readFully(fd, buffer, header_length); len <= 0) {
        return len;
    }

    size_t message_length = (buffer[2] << 8) + buffer[3];

    constexpr char FRAME_TYPE_FIRST = 1 << 0;
    constexpr char FRAME_TYPE_LAST = 1 << 1;
    constexpr char FRAME_TYPE_MASK = FRAME_TYPE_FIRST | FRAME_TYPE_LAST;
    if ((buffer[1] & FRAME_TYPE_MASK) == FRAME_TYPE_FIRST) { // This means the header is 8 bytes long, we need to read four more bytes.
        message_length += 4;
    }

    if ((header_length + message_length) > buffer_len) {
        // Not enough space in the buffer. This is unexpected.
        errno = EMSGSIZE;
        return -1;
    }

    if (ssize_t len = readFully(fd, buffer + header_length, message_length); len <= 0) {
        return len;
    }

    return header_length + message_length;
}

void AAWProxy::forward(ProxyDirection direction, std::atomic<bool>& should_exit) {
    // Sized to the largest frame the 2-byte length field can express: an 8-byte
    // extended header plus a 65535-byte payload = 65543. This guarantees a
    // well-formed frame is never rejected with EMSGSIZE in readMessage().
    // Heap-allocated (vector) to keep 64 KB off the thread stack.
    constexpr size_t buffer_len = 65544;
    std::vector<unsigned char> buffer(buffer_len);

    bool read_message;
    int read_fd, write_fd;
    std::string read_name, write_name;
    switch (direction) {
        case ProxyDirection::TCP_to_USB:
            read_message = true;

            read_fd = m_tcp_fd;
            read_name = "TCP";

            write_fd = m_usb_fd;
            write_name = "USB";
            break;
        case ProxyDirection::USB_to_TCP:
            read_message = false;

            read_fd = m_usb_fd;
            read_name = "USB";

            write_fd = m_tcp_fd;
            write_name = "TCP";
            break;
    }

    // Register this thread's handle so stopForwarding() can interrupt our
    // blocking read() with SIGUSR1. Registered before the loop so a sibling
    // that fails early can signal us as soon as we start blocking.
    {
        std::lock_guard<std::mutex> lock(m_threads_mutex);
        (direction == ProxyDirection::USB_to_TCP ? m_usb_tcp_handle : m_tcp_usb_handle) = pthread_self();
    }

    while (!should_exit) {
        // Read
        ssize_t len = read_message ? readMessage(read_fd, buffer.data(), buffer_len) : read(read_fd, buffer.data(), buffer_len);

        if (len <= 0) {
            // Start logging read/write details if there is an error.
            m_log_communication = true;
        }
        if (m_log_communication) {
            Logger::instance()->info("%zd bytes read from %s\n", len, read_name.c_str());
        }

        if (len < 0) {
            Logger::instance()->info("Read from %s failed: %s\n", read_name.c_str(), strerror(errno));
            break;
        }
        else if (len == 0) {
            break;
        }
        else if (should_exit) {
            break;
        }

        // Write — loop over partial writes so no bytes are dropped. A short
        // write can happen if the blocking write() is interrupted (e.g. by the
        // SIGUSR1 we use to stop forwarding).
        ssize_t wlen = 0;
        while (wlen < len) {
            ssize_t w = write(write_fd, buffer.data() + wlen, len - wlen);
            if (w < 0) {
                if (errno == EINTR && !should_exit) {
                    continue;
                }
                wlen = w;
                break;
            }
            if (w == 0) {
                break;
            }
            wlen += w;
        }

        if (wlen <= 0) {
            // Start logging read/write details if there is an error.
            m_log_communication = true;
        }
        if (m_log_communication) {
            Logger::instance()->info("%zd bytes written to %s\n", wlen, write_name.c_str());
        }

        if (wlen < 0) {
            Logger::instance()->info("Write to %s failed: %s\n", write_name.c_str(), strerror(errno));
            break;
        }
        else if (should_exit) {
            break;
        }
    }

    // Deregister our handle before signalling the sibling so we don't signal
    // ourselves and so a stale handle is never used.
    {
        std::lock_guard<std::mutex> lock(m_threads_mutex);
        (direction == ProxyDirection::USB_to_TCP ? m_usb_tcp_handle : m_tcp_usb_handle) = std::nullopt;
    }

    stopForwarding(should_exit);
}

void AAWProxy::stopForwarding(std::atomic<bool>& should_exit) {
    Logger::instance()->info("Interrupting threads to stop forwarding\n");
    should_exit = true;

    std::lock_guard<std::mutex> lock(m_threads_mutex);
    if (m_usb_tcp_handle) {
        pthread_kill(*m_usb_tcp_handle, SIGUSR1);
    }

    if (m_tcp_usb_handle) {
        pthread_kill(*m_tcp_usb_handle, SIGUSR1);
    }
}

void AAWProxy::handleClient(int server_sock) {
    struct sockaddr client_address;
    socklen_t client_addresslen = sizeof(client_address);
    if ((m_tcp_fd = accept(server_sock, &client_address, &client_addresslen)) < 0) {
        close(server_sock);
        Logger::instance()->info("accept failed: %s\n", strerror(errno));
        return;
    }

    close(server_sock);

    Logger::instance()->info("Tcp server accepted connection\n");

    // Phone connected via TCP, we can stop retrying bluetooth connection
    BluetoothHandler::instance().stopConnectWithRetry();

    if (Config::instance()->getConnectionStrategy() != ConnectionStrategy::USB_FIRST) {
        if (!UsbManager::instance().enableDefaultAndWaitForAccessory(std::chrono::seconds(30))) {
            close(m_tcp_fd);
            m_tcp_fd = -1;
            return;
        }
    }

    Logger::instance()->info("Opening usb accessory\n");
    if ((m_usb_fd = open("/dev/usb_accessory", O_RDWR)) < 0) {
        Logger::instance()->info("error opening /dev/usb_accessory: %s\n", strerror(errno));
        close(m_tcp_fd);
        m_tcp_fd = -1;
        return;
    }

    // Set timeout on the TCP socket
    struct timeval tv = {
        .tv_sec = 10,
        .tv_usec = 0,
    };

    if (setsockopt(m_tcp_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv))) {
        Logger::instance()->info("setsockopt failed: %s\n", strerror(errno));
        close(m_usb_fd);
        m_usb_fd = -1;
        close(m_tcp_fd);
        m_tcp_fd = -1;
        return;
    }

    // Setup signal handler
    struct sigaction sa;
    sa.sa_handler = empty_signal_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0;
    if (sigaction(SIGUSR1, &sa, NULL)) {
        Logger::instance()->info("Adding signal handler failed: %s\n", strerror(errno));
    }

    Logger::instance()->info("Forwarding data between TCP and USB\n");
    std::atomic<bool> should_exit = false;
    m_usb_tcp_thread = std::thread(&AAWProxy::forward, this, ProxyDirection::USB_to_TCP, std::ref(should_exit));
    m_tcp_usb_thread = std::thread(&AAWProxy::forward, this, ProxyDirection::TCP_to_USB, std::ref(should_exit));

    m_usb_tcp_thread->join();
    m_usb_tcp_thread = std::nullopt;

    m_tcp_usb_thread->join();
    m_tcp_usb_thread = std::nullopt;

    signal(SIGUSR1, SIG_DFL);

    close(m_usb_fd);
    m_usb_fd = -1;

    close(m_tcp_fd);
    m_tcp_fd = -1;

    Logger::instance()->info("Forwarding stopped\n");
}

std::optional<std::thread> AAWProxy::startServer(int32_t port) {
    Logger::instance()->info("Starting tcp server\n");
    int server_sock;
    if ((server_sock = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        Logger::instance()->info("creating socket failed: %s\n", strerror(errno));
        return std::nullopt;
    }

    int opt = 1;
    if (setsockopt(server_sock, SOL_SOCKET, SO_REUSEADDR | SO_REUSEPORT, &opt, sizeof(opt))) {
        Logger::instance()->info("setsockopt failed: %s\n", strerror(errno));
        close(server_sock);
        return std::nullopt;
    }

    struct sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(port);

    if (bind(server_sock, (struct sockaddr*)&address, sizeof(address)) < 0) {
        Logger::instance()->info("bind failed: %s\n", strerror(errno));
        close(server_sock);
        return std::nullopt;
    }

    if (listen(server_sock, 3) < 0) {
        Logger::instance()->info("listen failed: %s\n", strerror(errno));
        close(server_sock);
        return std::nullopt;
    }

    Logger::instance()->info("Tcp server listening on %d\n", port);

    return std::thread(&AAWProxy::handleClient, this, server_sock);
}
