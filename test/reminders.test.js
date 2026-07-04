// Reminder scheduling: stage selection, no double-sends, skip-ahead behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueReminderStage, nextReminder, stageThreshold, STAGES } from '../src/reminders.js';
import { DAY_MS } from '../src/util.js';

const DUE = new Date('2026-07-10T12:00:00Z');
const at = (daysFromDue) => new Date(DUE.getTime() + daysFromDue * DAY_MS);

const invoice = (over = {}) => ({
  id: 'INV-2026-0001',
  status: 'SENT',
  dueAt: DUE.toISOString(),
  reminders: [],
  ...over,
});

const sent = (...stages) => stages.map((s) => ({ stage: s, sentAt: at(-3).toISOString() }));

test('long before due (due−5d): silence', () => {
  assert.equal(dueReminderStage(invoice(), at(-5)), null);
});

test('just before the gentle window (due−2d−1min): still silent', () => {
  const justBefore = new Date(at(-2).getTime() - 60_000);
  assert.equal(dueReminderStage(invoice(), justBefore), null);
});

test('at due−2d the gentle nudge fires', () => {
  assert.equal(dueReminderStage(invoice(), at(-2))?.key, 'gentle');
});

test('gentle already sent: quiet until the due-day stage opens', () => {
  const inv = invoice({ reminders: sent('gentle') });
  assert.equal(dueReminderStage(inv, at(-1)), null);       // day between stages
  assert.equal(dueReminderStage(inv, at(0))?.key, 'due');  // due day arrives
});

test('same stage never double-sends on repeated runs', () => {
  const inv = invoice();
  const first = dueReminderStage(inv, at(-2));
  assert.equal(first?.key, 'gentle');
  inv.reminders.push({ stage: first.key, sentAt: at(-2).toISOString() });
  assert.equal(dueReminderStage(inv, at(-2)), null);                          // same moment
  assert.equal(dueReminderStage(inv, new Date(at(-2).getTime() + 3600e3)), null); // an hour later
});

test('at due+3d the escalation fires (gentle + due already sent)', () => {
  const inv = invoice({ reminders: sent('gentle', 'due') });
  assert.equal(dueReminderStage(inv, at(2)), null);              // overdue but pre-escalation
  assert.equal(dueReminderStage(inv, at(3))?.key, 'escalation'); // due+3d
});

test('agent was offline for a week: only the most advanced stage fires, not three at once', () => {
  assert.equal(dueReminderStage(invoice(), at(5))?.key, 'escalation');
});

test('a later stage on record silences earlier stages (clock weirdness safe)', () => {
  const inv = invoice({ reminders: sent('escalation') });
  assert.equal(dueReminderStage(inv, at(0)), null);
  assert.equal(dueReminderStage(inv, at(10)), null);
});

test('PAID invoices are never chased', () => {
  assert.equal(dueReminderStage(invoice({ status: 'PAID' }), at(5)), null);
});

test('PARTIAL invoices keep getting chased for the remainder', () => {
  const inv = invoice({ status: 'PARTIAL', reminders: sent('gentle') });
  assert.equal(dueReminderStage(inv, at(0))?.key, 'due');
});

test('every stage fires exactly once across a full unpaid lifecycle', () => {
  const inv = invoice();
  const fired = [];
  // simulate a daily cron from due−4d to due+6d
  for (let d = -4; d <= 6; d++) {
    const stage = dueReminderStage(inv, at(d));
    if (stage) {
      fired.push(`${stage.key}@${d}`);
      inv.reminders.push({ stage: stage.key, sentAt: at(d).toISOString() });
    }
  }
  assert.deepEqual(fired, ['gentle@-2', 'due@0', 'escalation@3']);
});

test('stageThreshold puts the stages exactly where the spec says', () => {
  const [gentle, due, escalation] = STAGES;
  assert.equal(stageThreshold(DUE, gentle).getTime(), DUE.getTime() - 2 * DAY_MS);
  assert.equal(stageThreshold(DUE, due).getTime(), DUE.getTime());
  assert.equal(stageThreshold(DUE, escalation).getTime(), DUE.getTime() + 3 * DAY_MS);
});

test('nextReminder reports the upcoming stage for list/log output', () => {
  const inv = invoice();
  const next = nextReminder(inv, at(-5));
  assert.equal(next.stage.key, 'gentle');
  assert.equal(next.at.getTime(), at(-2).getTime());

  const afterGentle = invoice({ reminders: sent('gentle') });
  assert.equal(nextReminder(afterGentle, at(-1)).stage.key, 'due');

  const paid = invoice({ status: 'PAID' });
  assert.equal(nextReminder(paid, at(0)), null);
});
