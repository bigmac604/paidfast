// Builds the "facts" object interpolated into all email copy (adapters/llm.js).
// One place where invoice -> human-facing strings happens, so tone stays consistent.

import { OWNER, CHAIN, now } from './config.js';
import { formatAmount, humanDate, duePhrase, daysUntil, shortHash, DAY_MS } from './util.js';

/** The plain-text payment instructions block embedded in every email. */
/** True for a real-looking 0x… contract address (placeholders stay internal). */
export function isRealAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || ''));
}

export function paymentBlock(invoice) {
  const token = CHAIN.tokens[invoice.token] || {};
  const owed = invoice.status === 'PARTIAL' ? invoice.remaining : invoice.amount;
  const rows = [
    ['Network', `${CHAIN.network} — chainId ${CHAIN.chainId}`],
    ['Token', `${invoice.token}${isRealAddress(token.address) ? `  (contract ${token.address})` : ''}`],
    ['Amount', `${formatAmount(owed)} ${invoice.token} — exact amount, please`],
    ['Address', `${invoice.address}  (unique to this invoice)`],
    ['Reference', `${invoice.reference}  (keep for your records)`],
  ];
  const pad = Math.max(...rows.map(([k]) => k.length));
  const lines = rows.map(([k, v]) => `  ${k.padEnd(pad)}   ${v}`);
  lines.push('', `  ${'!'.padEnd(pad)}   Send on the X Layer network only — funds sent on other`);
  lines.push(`  ${' '.padEnd(pad)}   networks (Ethereum, Tron, ...) cannot be recovered automatically.`);
  return lines.join('\n');
}

export function buildFacts(invoice, at = now()) {
  const firstName = String(invoice.client || 'there').trim().split(/\s+/)[0];
  const lastPayment = (invoice.payments || [])[invoice.payments?.length - 1];
  return {
    clientName: invoice.client,
    clientFirstName: firstName,
    invoiceId: invoice.id,
    reference: invoice.reference,
    token: invoice.token,
    description: invoice.description,
    amountDue: formatAmount(invoice.amount),
    amountPaid: formatAmount(invoice.amountPaid || 0),
    remaining: formatAmount(invoice.remaining ?? invoice.amount),
    isPartial: invoice.status === 'PARTIAL',
    overpaid: Boolean(invoice.overpaid),
    overpaidBy: formatAmount(invoice.overpaidBy || 0),
    dueHuman: humanDate(invoice.dueAt),
    duePhrase: duePhrase(invoice.dueAt, at),
    daysOverdue: Math.max(0, -daysUntil(invoice.dueAt, at)),
    graceDeadlineHuman: humanDate(new Date(at.getTime() + 3 * DAY_MS)),
    lastTxHash: lastPayment ? shortHash(lastPayment.txHash) : 'n/a',
    ownerName: OWNER.name,
    paymentBlock: paymentBlock(invoice),
  };
}
