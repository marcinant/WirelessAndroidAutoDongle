// OBD transport abstraction. The ELM327 protocol layer talks to whichever
// transport is active:
//   - 'bt'   — RFCOMM/SPP to a real Bluetooth adapter (native AawgObd module)
//   - 'tcp'  — TCP socket, e.g. to the ELM327-emulator project running on a
//              dev machine (`elm -n 35000`), or a wifi ELM327 clone
//   - 'demo' — built-in simulator (src/obd/demo.ts); no hardware at all
//
// This is what makes the whole OBD feature testable without a car.

import { obdConnect, obdCommand, obdDisconnect } from './native';
import { tcpConnect, tcpCommand, tcpDisconnect } from './tcpNative';
import { demoConnect, demoCommand, demoDisconnect } from './demo';

export type TransportKind = 'bt' | 'tcp' | 'demo';

export interface Transport {
  kind: TransportKind;
  connect(target: string): Promise<void>; // MAC for bt, host:port for tcp, ignored for demo
  command(cmd: string, timeoutMs?: number): Promise<string>;
  disconnect(): Promise<void>;
}

const btTransport: Transport = {
  kind: 'bt',
  connect: t => obdConnect(t),
  command: (c, t) => obdCommand(c, t),
  disconnect: () => obdDisconnect(),
};

const tcpTransport: Transport = {
  kind: 'tcp',
  connect: t => tcpConnect(t),
  command: (c, t) => tcpCommand(c, t),
  disconnect: () => tcpDisconnect(),
};

const demoTransport: Transport = {
  kind: 'demo',
  connect: () => demoConnect(),
  command: c => demoCommand(c),
  disconnect: () => demoDisconnect(),
};

let active: Transport = btTransport;

export function setTransport(kind: TransportKind): void {
  active = kind === 'tcp' ? tcpTransport : kind === 'demo' ? demoTransport : btTransport;
}

export function getTransport(): Transport {
  return active;
}
