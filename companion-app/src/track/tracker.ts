// Trip tracker singleton: while active, keeps a location foreground service
// running, listens for GPS fixes, pairs each with the latest OBD readings, and
// forwards them to Traccar. Survives the app being backgrounded during an
// Android Auto drive because the foreground service keeps the JS process alive.

import { obdSession } from '../obd/session';
import { TraccarConfig, sendFix } from './traccar';
import {
  GpsFix,
  onGpsFix,
  startLocation,
  stopLocation,
  startForeground,
  stopForeground,
  trackingAvailable,
} from './native';

type Listener = () => void;

class Tracker {
  active = false;
  lastFix: GpsFix | null = null;
  lastSentAt = 0;
  sentCount = 0;
  lastError: string | null = null;

  private cfg: TraccarConfig | null = null;
  private minGapMs = 10000;
  private unsub: () => void = () => {};
  private listeners = new Set<Listener>();

  available(): boolean {
    return trackingAvailable();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  async start(cfg: TraccarConfig, minGapSeconds = 10): Promise<void> {
    if (this.active) return;
    this.cfg = cfg;
    this.minGapMs = Math.max(1, minGapSeconds) * 1000;
    this.lastError = null;
    this.sentCount = 0;

    await startForeground('AAWG — trip tracking', 'Sending position + engine data to Traccar');
    this.unsub = onGpsFix(fix => this.onFix(fix));
    await startLocation(Math.min(this.minGapMs, 5000), 5);
    this.active = true;
    this.emit();
  }

  private async onFix(fix: GpsFix) {
    this.lastFix = fix;
    const cfg = this.cfg;
    if (!cfg) return;
    const now = fix.time || Date.now();
    if (now - this.lastSentAt < this.minGapMs) {
      this.emit();
      return;
    }
    this.lastSentAt = now;
    const ok = await sendFix(cfg, fix, obdSession.readings);
    if (ok) {
      this.sentCount++;
      this.lastError = null;
    } else {
      this.lastError = 'send failed';
    }
    this.emit();
  }

  async stop(): Promise<void> {
    this.unsub();
    this.unsub = () => {};
    await stopLocation();
    await stopForeground();
    this.active = false;
    this.emit();
  }
}

export const tracker = new Tracker();
