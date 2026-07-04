// JSON state store — state/invoices.json.
// Deliberately simple: a CLI writing a small JSON file (atomic-ish via temp+rename).
// (README originally said SQLite; v0 uses JSON per the no-native-deps constraint.)

import fs from 'node:fs';
import path from 'node:path';
import { PATHS, now } from './config.js';

const EMPTY = () => ({ invoices: [], meta: { seq: 0, createdAt: now().toISOString() } });

export function loadState() {
  try {
    const raw = fs.readFileSync(PATHS.stateFile, 'utf8');
    const state = JSON.parse(raw);
    if (!Array.isArray(state.invoices)) throw new Error('missing "invoices" array');
    state.meta = state.meta || { seq: state.invoices.length };
    return state;
  } catch (err) {
    if (err.code === 'ENOENT') return EMPTY();
    throw new Error(
      `State file ${PATHS.stateFile} is unreadable (${err.message}). ` +
      'Fix or delete it to start fresh.',
    );
  }
}

export function saveState(state) {
  fs.mkdirSync(path.dirname(PATHS.stateFile), { recursive: true });
  const tmp = `${PATHS.stateFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, PATHS.stateFile);
}

/** Next invoice id, e.g. INV-2026-0007. */
export function nextInvoiceId(state) {
  state.meta.seq = (state.meta.seq || 0) + 1;
  const year = now().getFullYear();
  return `INV-${year}-${String(state.meta.seq).padStart(4, '0')}`;
}

/** Find by invoice id or payment reference (case-insensitive). */
export function findInvoice(state, idOrRef) {
  const q = String(idOrRef || '').toUpperCase();
  return state.invoices.find(
    (inv) => inv.id.toUpperCase() === q || inv.reference.toUpperCase() === q,
  ) || null;
}

/** Invoices that still need watching / chasing. */
export function openInvoices(state) {
  return state.invoices.filter((inv) => inv.status === 'SENT' || inv.status === 'PARTIAL');
}
