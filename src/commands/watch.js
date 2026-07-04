// `paidfast watch` — check X Layer for incoming payments on open invoices.
//   node src/index.js watch                     one pass over all open invoices
//   node src/index.js watch --loop              keep checking until all are paid
//   node src/index.js watch --interval 10       loop delay in seconds (default 15)
//   node src/index.js watch --scenario partial  mock: partial-then-full payment
//   node src/index.js watch --scenario over     mock: 110% overpayment
//   node src/index.js watch --pay-on 2          mock: money arrives on pass #2
//
// PARTIAL payments set status=PARTIAL and track the remaining balance;
// overpayments flip to PAID with an overpaid flag (surfaced on the receipt
// and in the owner email). On PAID: receipt + sweep via src/receipts.js.

import { MODE, now } from '../config.js';
import { c, sym, sleep, formatAmount, duePhrase, UsageError } from '../util.js';
import { loadState, saveState, openInvoices } from '../store.js';
import { transferMatchesInvoice, applyPayment } from '../matcher.js';
import { handleInvoicePaid } from '../receipts.js';
import * as chain from '../adapters/chain.js';

export async function cmdWatch(opts = {}) {
  const loop = Boolean(opts.loop);
  const interval = Math.max(1, Number(opts.interval || 15));
  if (opts.interval && Number.isNaN(Number(opts.interval))) {
    throw new UsageError(`--interval must be a number of seconds (got "${opts.interval}").`);
  }

  let pass = 0;
  for (;;) {
    pass += 1;
    const anythingLeft = await watchOnce(opts);
    if (!loop) return;
    if (!anythingLeft) {
      console.log(`  ${c.green(`${sym.ok} all invoices settled — watcher signing off.`)}\n`);
      return;
    }
    console.log(c.dim(`  … sleeping ${interval}s (pass ${pass} done, Ctrl+C to stop)\n`));
    await sleep(interval * 1000);
  }
}

/** One pass. Returns true when open invoices remain. */
async function watchOnce(opts) {
  const state = loadState();
  const open = openInvoices(state);

  if (open.length === 0) {
    console.log(`\n  ${sym.dot} nothing to watch — no open invoices. ${c.dim('Create one with: node src/index.js create …')}\n`);
    return false;
  }

  console.log('');
  console.log(`  ${c.bold(`${sym.dot} watching ${open.length} invoice${open.length > 1 ? 's' : ''} on X Layer`)} ${c.dim(`[${MODE}]`)}`);

  const at = now();
  let dirty = false;

  for (const invoice of open) {
    const { checkNumber, transfers } = await chain.checkForTransfers(invoice, {
      scenario: opts.scenario,
      payOn: opts['pay-on'],
    });

    const tag = `${invoice.id} ${c.dim(`(${invoice.reference} · ${duePhrase(invoice.dueAt, at)})`)}`;
    const checkLabel = checkNumber ? `check #${checkNumber}` : 'scan';

    const matching = transfers.filter((t) => transferMatchesInvoice(invoice, t));
    if (matching.length === 0) {
      console.log(`    ${c.dim(checkLabel)} ${tag} ${c.dim('… no matching transfers yet')}`);
      continue;
    }

    for (const transfer of matching) {
      const outcome = applyPayment(invoice, transfer);
      invoice.payments.push({
        txHash: transfer.txHash,
        from: transfer.from,
        amount: transfer.amount,
        blockNumber: transfer.blockNumber,
        at: transfer.at,
      });
      invoice.amountPaid = outcome.amountPaid;
      invoice.remaining = outcome.remaining;
      invoice.overpaid = outcome.overpaid;
      invoice.overpaidBy = outcome.overpaidBy;
      invoice.status = outcome.status;
      dirty = true;

      console.log(`    ${c.dim(checkLabel)} ${tag}`);
      console.log(`      ${c.green(`${sym.bolt} transfer detected`)} ${formatAmount(transfer.amount)} ${invoice.token} ${c.dim(`tx ${transfer.txHash.slice(0, 18)}… block ${transfer.blockNumber}`)}`);

      if (outcome.status === 'PARTIAL') {
        console.log(`      ${c.yellow(`${sym.arrow} PARTIAL payment`)} — ${formatAmount(outcome.amountPaid)} of ${formatAmount(invoice.amount)} ${invoice.token} received, ${c.bold(`${formatAmount(outcome.remaining)} ${invoice.token} remaining`)}`);
        console.log(`      ${c.dim('reminders will now chase the remaining balance')}`);
      } else {
        invoice.paidAt = transfer.at;
        const overNote = outcome.overpaid
          ? ` ${c.yellow(`(${sym.warn} overpaid by ${formatAmount(outcome.overpaidBy)} ${invoice.token} — flagged)`)}`
          : '';
        console.log(`      ${c.green(c.bold(`${sym.ok} PAID in full`))} — ${formatAmount(outcome.amountPaid)} ${invoice.token}${overNote}`);
        await handleInvoicePaid(invoice, at);
      }
    }
  }

  if (dirty) saveState(state);

  const stillOpen = openInvoices(state).length;
  console.log(c.dim(`    ${stillOpen === 0 ? 'all settled ✧' : `${stillOpen} still awaiting payment`}`));
  console.log('');
  return stillOpen > 0;
}
