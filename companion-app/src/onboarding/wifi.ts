import WifiManager from 'react-native-wifi-reborn';

// Join the dongle's access point. On Android 10+ react-native-wifi-reborn uses
// WifiNetworkSpecification under the hood: the OS shows a one-tap confirm
// dialog and binds THIS app's traffic to the dongle network, while the phone's
// mobile data keeps flowing on its own network. That binding is what lets the
// app reach 10.0.0.1 without the user manually switching wifi in Settings.
export async function joinDongleWifi(
  ssid: string,
  password: string,
): Promise<void> {
  // isWep=false, isHidden=false. joinOnce=false keeps the suggestion around
  // for the session so status polling survives brief drops.
  await WifiManager.connectToProtectedSSID(ssid, password, false, false);
}

export async function currentSsid(): Promise<string | null> {
  try {
    return await WifiManager.getCurrentWifiSSID();
  } catch {
    return null;
  }
}

export async function disconnectDongleWifi(): Promise<void> {
  try {
    await WifiManager.disconnect();
  } catch {
    // best effort; the OS reclaims the suggestion when the app backgrounds
  }
}
