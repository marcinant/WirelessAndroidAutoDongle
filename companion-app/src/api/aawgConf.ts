// Read/patch individual AAWG_* keys inside the raw /boot/aawgd.conf text.
// Mirrors the in-place set_var logic in ha.cgi so the app can edit single
// options without clobbering the user's comments and layout: we POST the whole
// file back through config.cgi, but only the touched lines change.

export type ConfMap = Record<string, string>;

// Value of a key, or '' when the key is absent or commented out.
export function getConf(text: string, key: string): string {
  const re = new RegExp(`^${key}=(.*)$`, 'm');
  const m = text.match(re);
  return m ? m[1] : '';
}

export function isEnabled(text: string, key: string, def: boolean): boolean {
  const v = getConf(text, key);
  if (v === '') return def;
  return v !== '0';
}

// Set (or, with empty value, comment out) a key in place. Replaces the first
// commented-or-active assignment, else appends.
export function setConf(text: string, key: string, value: string): string {
  const line = value ? `${key}=${value}` : `#${key}=`;
  const re = new RegExp(`^#*${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  return text.replace(/\n?$/, `\n${line}\n`);
}

export function setConfMany(text: string, values: ConfMap): string {
  let out = text;
  for (const [k, v] of Object.entries(values)) out = setConf(out, k, v);
  return out;
}
