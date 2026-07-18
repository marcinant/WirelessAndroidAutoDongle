#pragma once

#include <optional>
#include <thread>
#include <future>
#include <mutex>
#include <atomic>

#include "bluetoothCommon.h"

class BluezAdapterProxy;
class AAWirelessProfile;
class HSPHSProfile;
class BLEAdvertisement;

class BluetoothHandler {
public:
    static BluetoothHandler& instance();

    void init();
    void powerOn();
    void powerOff();

    std::optional<std::thread> connectWithRetry();
    void stopConnectWithRetry();

    void releaseHandsetLink(const std::string& devicePath);
    void notifyAaSessionStarted();

private:
    BluetoothHandler() {};
    BluetoothHandler(BluetoothHandler const&);
    BluetoothHandler& operator=(BluetoothHandler const&);

    DBus::ManagedObjects getBluezObjects();

    void initAdapter();
    void setPower(bool on);
    void setPairable(bool pairable);
    void exportProfiles();
    void connectDevice();

    void startAdvertising();
    void stopAdvertising();

    void retryConnectLoop();

    std::mutex connectWithRetryMutex;
    std::shared_ptr<std::promise<void>> connectWithRetryPromise;
    bool connectWithRetrySignalled = false;

    // Set when the phone opens the AA Wireless channel; the retry loop must
    // not disconnect-and-reconnect the device while the bootstrap is running.
    std::atomic<bool> m_aaSessionActive{false};

    std::shared_ptr<DBus::Dispatcher> m_dispatcher;
    std::shared_ptr<DBus::Connection> m_connection;
    std::shared_ptr<BluezAdapterProxy> m_adapter;

    std::shared_ptr<AAWirelessProfile> m_aawProfile;
    std::shared_ptr<HSPHSProfile> m_hspProfile;

    std::shared_ptr<BLEAdvertisement> m_leAdvertisement;

    std::string m_adapterAlias;
};
