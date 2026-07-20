// Shared ELM327 session so the live view and the trip tracker use one serial
// link (a second connection to the same adapter is impossible). Owns connect
// state, the poll loop, and the latest readings; subscribers get notified.

import { elmConnect, elmDisconnect, poll, healthAlerts, HealthAlert } from './elm327';
import { ObdReadings } from './pids';

type Listener = () => void;

const LIVE_PIDS: (keyof ObdReadings)[] = [
  'rpm', 'speed', 'coolant', 'load', 'throttle', 'voltage', 'fuelLevel', 'maf', 'fuelRate', 'stft', 'ltft', 'intake',
];

class ObdSession {
  connected = false;
  connecting = false;
  readings: ObdReadings = {};
  alerts: HealthAlert[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private listeners = new Set<Listener>();
  private address: string | null = null;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  async connect(address: string): Promise<void> {
    if (this.connected && this.address === address) return;
    this.connecting = true;
    this.emit();
    try {
      await elmConnect(address);
      this.address = address;
      this.connected = true;
      this.startPolling();
    } finally {
      this.connecting = false;
      this.emit();
    }
  }

  private startPolling() {
    this.stopPolling();
    this.timer = setInterval(async () => {
      if (this.inFlight || !this.connected) return;
      this.inFlight = true;
      try {
        this.readings = await poll(LIVE_PIDS);
        this.alerts = healthAlerts(this.readings);
        this.emit();
      } catch {
        // keep going; a hard failure surfaces on the next connect attempt
      } finally {
        this.inFlight = false;
      }
    }, 1200);
  }

  private stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    await elmDisconnect();
    this.connected = false;
    this.address = null;
    this.readings = {};
    this.alerts = [];
    this.emit();
  }
}

export const obdSession = new ObdSession();
