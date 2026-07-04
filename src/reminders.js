// Reminder scheduling — pure functions, fully unit-tested (test/reminders.test.js).
//
// Three escalating stages, keyed to the invoice due date:
//   gentle      at due − 2 days   (friendly heads-up)
//   due         at due            (firmer, day-of)
//   escalation  at due + 3 days   (professional escalation)
//
// Rules:
//   - Only unpaid invoices (SENT or PARTIAL) get reminders.
//   - Each stage sends at most once (history lives on invoice.reminders).
//   - If time has passed several thresholds (e.g. the agent wasn't run for a
//     week), only the MOST ADVANCED eligible stage fires — the client gets one
//     escalation email, not three stale ones in a row.
//   - Once a later stage has been sent, earlier stages never fire.

import { DAY_MS } from './util.js';

export const STAGES = [
  { key: 'gentle', offsetDays: -2, label: 'gentle nudge (due − 2d)' },
  { key: 'due', offsetDays: 0, label: 'due today (day-of)' },
  { key: 'escalation', offsetDays: 3, label: 'escalation (due + 3d)' },
];

const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);

/** The moment a stage becomes eligible for an invoice. */
export function stageThreshold(dueAt, stage) {
  return new Date(new Date(dueAt).getTime() + stage.offsetDays * DAY_MS);
}

/**
 * Which reminder (if any) should be sent for this invoice right now?
 * Returns a stage object from STAGES, or null.
 */
export function dueReminderStage(invoice, at = new Date()) {
  if (invoice.status !== 'SENT' && invoice.status !== 'PARTIAL') return null;

  const t = at.getTime();
  let candidate = null;
  for (const stage of STAGES) {
    if (t >= stageThreshold(invoice.dueAt, stage).getTime()) candidate = stage;
  }
  if (!candidate) return null; // nothing eligible yet

  // If this stage — or any later one — has already been sent, stay quiet.
  const sent = new Set((invoice.reminders || []).map((r) => r.stage));
  for (let i = stageIndex(candidate.key); i < STAGES.length; i++) {
    if (sent.has(STAGES[i].key)) return null;
  }
  return candidate;
}

/**
 * The next reminder on the calendar for this invoice (for `list`/log output).
 * Returns { stage, at } or null when no further reminders will ever fire.
 */
export function nextReminder(invoice, at = new Date()) {
  if (invoice.status !== 'SENT' && invoice.status !== 'PARTIAL') return null;
  const sent = new Set((invoice.reminders || []).map((r) => r.stage));
  const lastSentIdx = Math.max(-1, ...[...sent].map(stageIndex));
  const t = at.getTime();
  for (let i = lastSentIdx + 1; i < STAGES.length; i++) {
    const threshold = stageThreshold(invoice.dueAt, STAGES[i]);
    if (t < threshold.getTime()) return { stage: STAGES[i], at: threshold };
  }
  // Everything remaining is already eligible → it will fire on the next `remind`.
  const stage = dueReminderStage(invoice, at);
  return stage ? { stage, at } : null;
}
