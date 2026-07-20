// Diagnostic trouble code (DTC) read/clear over ELM327.
// Mode 03 returns stored codes as pairs of bytes; mode 04 clears them.

import { obdCommand } from './native';

// Decode a 2-byte DTC into its "P0301"-style string.
function decodeDtc(hi: number, lo: number): string {
  const letters = ['P', 'C', 'B', 'U'];
  const letter = letters[(hi & 0xc0) >> 6];
  const d1 = (hi & 0x30) >> 4;
  const d2 = hi & 0x0f;
  const d3 = (lo & 0xf0) >> 4;
  const d4 = lo & 0x0f;
  return `${letter}${d1}${d2.toString(16)}${d3.toString(16)}${d4.toString(16)}`.toUpperCase();
}

// Read stored DTCs (mode 03). Returns [] when there are none.
export async function readDtcs(): Promise<string[]> {
  const raw = await obdCommand('03', 3000);
  const hex = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
  const i = hex.indexOf('43'); // mode 03 response header
  if (i < 0) return [];
  let body = hex.slice(i + 2);
  const codes: string[] = [];
  for (let j = 0; j + 3 < body.length; j += 4) {
    const hi = parseInt(body.substr(j, 2), 16);
    const lo = parseInt(body.substr(j + 2, 2), 16);
    if (hi === 0 && lo === 0) continue; // padding
    codes.push(decodeDtc(hi, lo));
  }
  // Dedupe (multi-frame replies can repeat)
  return [...new Set(codes)];
}

// Clear stored DTCs and the MIL (mode 04).
export async function clearDtcs(): Promise<void> {
  await obdCommand('04', 3000);
}
