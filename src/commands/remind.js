// `paidfast remind` — the collections loop. Run it on a schedule (cron / Task
// Scheduler / a keep-alive shell). For each unpaid invoice it works out which
// escalation stage is due (src/reminders.js), writes the copy (adapters/llm.js)
// and sends it (adapters/email.js). History on the invoice guarantees nothing
// ever double-sends.
//
// Time-travel for testing:  PAIDFAST_NOW=2026-07-12T09:00:00Z node src/index.js remind

import { MODE, now } from '../config.js';
import { c, sym, humanDate } from '../util.js';
import { loadState, saveState, openInvoices } from '../store.js';
import { dueReminderStage, nextReminder } from '../reminders.js';
import { buildFacts } from '../facts.js';
import { generateEmailCopy } from '../adapters/llm.js';
import { sendEmail } from '../adapters/email.js';

export async function cmdRemind() {
  const state = loadState();
  const open = openInvoices(state);
  const at = now();

  console.log('');
  console.log(`  ${c.bold(`${sym.mail} collections check`)} ${c.dim(`${at.toISOString()} [${MODE}]`)}`);

  if (open.length === 0) {
    console.log(`    nothing to chase — no open invoices.\n`);
    return { sent: 0 };
  }

  let sent = 0;
  for (const invoice of open) {
    const stage = dueReminderStage(invoice, at);
    const label = `${invoice.id} ${c.dim(`(${invoice.client}, due ${humanDate(invoice.dueAt)})`)}`;

    if (!stage) {
      const next = nextReminder(invoice, at);
      const nextNote = next
        ? `next: ${next.stage.key} on ${humanDate(next.at)}`
        : 'no further reminders scheduled';
      console.log(`    ${c.dim('–')} ${label} ${c.dim(`… nothing due (${nextNote})`)}`);
      continue;
    }

    if (!invoice.clientEmail) {
      console.log(`    ${c.yellow(sym.warn)} ${label} — ${c.yellow(`${stage.key} reminder is due but there's no client email on file`)}`);
      console.log(`      ${c.dim('add one to the invoice record in state/invoices.json to enable chasing')}`);
      continue;
    }

    const copy = await generateEmailCopy(stage.key, buildFacts(invoice, at));
    const result = await sendEmail({
      to: `${invoice.client} <${invoice.clientEmail}>`,
      subject: copy.subject,
      text: copy.text,
      kind: `reminder-${stage.key}`,
      invoiceId: invoice.id,
      attachments: invoice.invoiceHtml ? [invoice.invoiceHtml] : [],
    });

    invoice.reminders.push({
      stage: stage.key,
      sentAt: at.toISOString(),
      subject: copy.subject,
      file: result.file || null,
    });
    sent += 1;

    console.log(`    ${c.green(sym.mail)} ${label}`);
    console.log(`      ${c.bold(stage.label)} ${sym.arrow} ${invoice.clientEmail}`);
    console.log(`      ${c.dim(`subject: ${copy.subject}`)}`);
    if (result.file) console.log(`      ${c.dim(`written: ${result.file}`)}`);
  }

  saveState(state);
  console.log(`    ${c.dim(`${sent} reminder${sent === 1 ? '' : 's'} sent · re-run any time — stages never double-send`)}`);
  console.log('');
  return { sent };
}
