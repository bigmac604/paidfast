// Small shared utilities: money math in integer base units, date handling,
// terminal styling, id/reference generation. Zero dependencies.

import crypto from 'node:crypto';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

/* ------------------------------------------------------------------ errors */

/** Thrown when a real-mode adapter is missing wiring/credentials. */
export class NotConfiguredError extends Error {
  constructor(message, hints = []) {
    super(message);
    this.name = 'NotConfiguredError';
    this.hints = hints;
  }
}

/** Thrown for bad CLI input. */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/* ------------------------------------------------------------- money math */

/**
 * Convert a token amount (e.g. 500.25 USDT) to integer base units (6 decimals
 * by default, matching USDT/USDC). All comparisons happen in base units so
 * float noise (0.1 + 0.2) can never mis-classify a payment.
 */
export function toBaseUnits(amount, decimals = 6) {
  return Math.round(Number(amount) * 10 ** decimals);
}

export function fromBaseUnits(units, decimals = 6) {
  return units / 10 ** decimals;
}

/** "500" -> "500.00", "0.1234567" -> "0.123457", trims trailing zeros past 2dp. */
export function formatAmount(n) {
  const fixed = Number(n).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  const [int, dec = ''] = fixed.split('.');
  return dec.length >= 2 ? `${int}.${dec}` : `${int}.${dec.padEnd(2, '0')}`;
}

/* ------------------------------------------------------------------ dates */

/**
 * Parse a --due spec relative to `from`:
 *   "7d"  -> 7 days from now        "48h" -> 48 hours from now
 *   "2026-07-15" -> end of that day (local)
 *   anything Date-parseable -> as-is
 */
export function parseDue(spec, from = new Date()) {
  const s = String(spec ?? '').trim();
  let m = /^(\d+(?:\.\d+)?)d$/i.exec(s);
  if (m) return new Date(from.getTime() + Number(m[1]) * DAY_MS);
  m = /^(\d+(?:\.\d+)?)h$/i.exec(s);
  if (m) return new Date(from.getTime() + Number(m[1]) * HOUR_MS);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T23:59:59`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  throw new UsageError(`Could not parse --due "${spec}". Use e.g. "7d", "48h", or "2026-07-15".`);
}

/** "Fri, Jul 10, 2026" */
export function humanDate(d) {
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Whole days from `at` to `due` (negative = overdue). */
export function daysUntil(due, at = new Date()) {
  return Math.ceil((new Date(due).getTime() - new Date(at).getTime()) / DAY_MS);
}

/** "due in 2 days" | "due today" | "3 days overdue" */
export function duePhrase(due, at = new Date()) {
  const days = daysUntil(due, at);
  if (days > 1) return `due in ${days} days`;
  if (days === 1) return 'due tomorrow';
  if (days === 0) return 'due today';
  if (days === -1) return '1 day overdue';
  return `${-days} days overdue`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------- ids */

const BASE32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no I/L/O/U/0/1 lookalikes

/** Unique payment reference, e.g. "PF-K7Q2M4RA". */
export function newReference(existing = new Set()) {
  for (let i = 0; i < 64; i++) {
    const bytes = crypto.randomBytes(8);
    let ref = 'PF-';
    for (let j = 0; j < 8; j++) ref += BASE32[bytes[j] % BASE32.length];
    if (!existing.has(ref)) return ref;
  }
  throw new Error('Could not generate a unique payment reference.');
}

export function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

export function randomTxHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

export function shortHash(h, keep = 8) {
  const s = String(h);
  return s.length <= keep * 2 + 3 ? s : `${s.slice(0, keep + 2)}…${s.slice(-keep + 2)}`;
}

/* ---------------------------------------------------------------- console */

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  green: wrap('32'),
  yellow: wrap('33'),
  red: wrap('31'),
  cyan: wrap('36'),
  magenta: wrap('35'),
  gray: wrap('90'),
};

// Unicode glyphs where the terminal is known-good; ASCII fallback for legacy conhost.
const uni = process.platform !== 'win32'
  || Boolean(process.env.WT_SESSION)
  || Boolean(process.env.TERM_PROGRAM)
  || (process.env.TERM || '').includes('xterm');

export const sym = {
  ok: uni ? '✔' : 'OK',
  fail: uni ? '✖' : 'X',
  dot: uni ? '●' : '*',
  arrow: uni ? '→' : '->',
  warn: uni ? '△' : '!',
  mail: uni ? '✉' : '@',
  bolt: uni ? '⚡' : '>>',
  hr: (n = 62) => (uni ? '─' : '-').repeat(n),
};

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
