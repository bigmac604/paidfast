// `paidfast list` — quick table of every invoice and where it stands.
//   node src/index.js list [--json]

import { now } from '../config.js';
import { c, formatAmount, duePhrase } from '../util.js';
import { loadState } from '../store.js';
import { nextReminder } from '../reminders.js';

export async function cmdList(opts = {}) {
  const state = loadState();
  const at = now();

  if (opts.json) {
    console.log(JSON.stringify(state.invoices, null, 2));
    return;
  }

  if (state.invoices.length === 0) {
    console.log(`\n  no invoices yet. ${c.dim('node src/index.js create --client "Acme" --amount 500 --for "landing page" --due 7d')}\n`);
    return;
  }

  const rows = state.invoices.map((inv) => {
    const next = nextReminder(inv, at);
    return {
      id: inv.id,
      client: inv.client.length > 18 ? inv.client.slice(0, 17) + '…' : inv.client,
      amount: `${formatAmount(inv.amount)} ${inv.token}`,
      status: inv.status + (inv.overpaid ? '*' : ''),
      due: inv.status === 'PAID' ? 'settled' : duePhrase(inv.dueAt, at),
      paid: formatAmount(inv.amountPaid || 0),
      chase: inv.status === 'PAID'
        ? '—'
        : `${(inv.reminders || []).length} sent${next ? `, next ${next.stage.key}` : ''}`,
    };
  });

  const cols = [
    ['id', 'INVOICE'], ['client', 'CLIENT'], ['amount', 'AMOUNT'], ['status', 'STATUS'],
    ['due', 'DUE'], ['paid', 'PAID'], ['chase', 'REMINDERS'],
  ];
  const width = Object.fromEntries(cols.map(([k, h]) => [
    k, Math.max(h.length, ...rows.map((r) => String(r[k]).length)),
  ]));

  const statusColor = (s) => (s.startsWith('PAID') ? c.green : s === 'PARTIAL' ? c.yellow : c.cyan);

  console.log('');
  console.log('  ' + cols.map(([k, h]) => c.dim(h.padEnd(width[k]))).join('   '));
  for (const r of rows) {
    console.log('  ' + cols.map(([k]) => {
      const v = String(r[k]).padEnd(width[k]);
      return k === 'status' ? statusColor(r[k])(v) : v;
    }).join('   '));
  }
  if (rows.some((r) => r.status.endsWith('*'))) {
    console.log(c.dim('\n  * overpaid — difference flagged for credit/refund'));
  }
  console.log('');
}
