// Shared visual language, mirrors the dongle web UI palette so the app and the
// browser panel feel like one product.
export const colors = {
  bg: '#14171a',
  card: '#1d2126',
  border: '#2c323a',
  text: '#dde3e8',
  textDim: '#7f8b96',
  textMid: '#aeb8c2',
  ok: '#6fd38b',
  warn: '#e8c268',
  bad: '#e87a68',
  accent: '#2c5aa0',
  accentText: '#ffffff',
  chartDown: '#6aa9e8',
  chartUp: '#6fd38b',
  chartRtt: '#e8c268',
  chartSig: '#b58ae8',
  inputBg: '#0d0f11',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 8 };

export function signalClass(dbm: number): 'ok' | 'warn' | 'bad' {
  if (dbm >= -60) return 'ok';
  if (dbm >= -72) return 'warn';
  return 'bad';
}
