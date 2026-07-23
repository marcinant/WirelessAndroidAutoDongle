// Shapes returned by the dongle CGI endpoints (see
// board/common/rootfs_overlay/usr/share/aawg-webui/cgi-bin/*.cgi).

export interface DongleStatus {
  uptime_s: number;
  aawgd_running: boolean;
  bt_powered: boolean;
  bt_devices: string; // ";"-separated "MAC name" entries
  wifi_stations: string; // ";"-separated "MAC signal dBm" entries
  tcp_state: string; // ESTABLISHED | none | ...
  usb_gadget: string; // accessory | default | none
  stage: string; // last interesting aawgd log line
}

// One parsed row of the stats.cgi CSV ring buffer.
export interface StatsSample {
  uptime_s: number;
  rx_bytes: number;
  tx_bytes: number;
  signal_dbm: number | null;
  tx_retries: number | null;
  tx_failed: number | null;
  rtt_ms: number | null;
  aa_session: boolean;
}

// Derived per-interval series the dashboard charts render.
export interface StatsSeries {
  downMbps: (number | null)[];
  upMbps: (number | null)[];
  rttMs: (number | null)[];
  signalDbm: (number | null)[];
  latest: StatsSample | null;
  wifiFailed: number | null;
}

export interface ConnectionEvent {
  source: 'wifi' | 'aa';
  time: number | null; // epoch seconds, when known (wifi events)
  text: string;
}

export interface HaSettings {
  url: string;
  token: string;
  entity: string;
  uplink: boolean;
}

// STA = the dongle joining the car's own wifi hotspot as a client, on a
// second virtual interface (wlan0_sta), to give the phone internet through
// the dongle's AP. See sta_status.cgi.
export type StaState =
  | 'unconfigured' // no SSID saved yet
  | 'disabled' // configured but not enabled
  | 'unsupported' // hardware/firmware rejected the concurrent AP+STA vif -
  // distinct from "disconnected", never conflated with it
  | 'starting'
  | 'scanning' // up, not associated yet (in/out of range - retries in the background)
  | 'error' // see reason, e.g. "auth_failed"
  | 'connected';

export interface StaStatus {
  configured: boolean;
  enabled: boolean;
  state: StaState;
  reason?: string;
  ssid: string;
  ip: string;
  rssi: number | null;
}

export interface StaConfig {
  ssid: string;
  password: string;
}
