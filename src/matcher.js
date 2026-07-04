// Payment matching — pure functions, fully unit-tested (test/matcher.test.js).
//
// A transfer belongs to an invoice when the token matches AND either:
//   - it was sent to the invoice's unique deposit address, or
//   - it carries the invoice's payment reference (mock transfers do; on real
//     EVM rails ERC-20 transfers have no memo field, so the reference is a
//     human-level fallback — see src/adapters/chain.js for the real-mode plan).
//
// Amount math happens in integer base units (10^6 for USDT/USDC) so floating
// point noise can never turn an exact payment into a "partial" one.

import { toBaseUnits, fromBaseUnits } from './util.js';

export const TOKEN_DECIMALS = 6;

/** Does this on-chain transfer belong to this invoice? */
export function transferMatchesInvoice(invoice, transfer) {
  if (!invoice || !transfer) return false;
  if (String(transfer.token || '').toUpperCase() !== String(invoice.token).toUpperCase()) {
    return false;
  }
  const addressMatch = Boolean(
    transfer.to && invoice.address &&
    String(transfer.to).toLowerCase() === String(invoice.address).toLowerCase(),
  );
  const referenceMatch = Boolean(
    transfer.reference && invoice.reference &&
    String(transfer.reference).toUpperCase() === String(invoice.reference).toUpperCase(),
  );
  return addressMatch || referenceMatch;
}

/**
 * Apply a matched transfer to an invoice's balance.
 * Returns the *outcome* (does not mutate the invoice):
 *   { status: 'PARTIAL'|'PAID', amountPaid, remaining, overpaid, overpaidBy }
 */
export function applyPayment(invoice, transfer, decimals = TOKEN_DECIMALS) {
  const due = toBaseUnits(invoice.amount, decimals);
  const already = toBaseUnits(invoice.amountPaid || 0, decimals);
  const incoming = toBaseUnits(transfer.amount, decimals);
  if (incoming <= 0) throw new Error(`Transfer amount must be positive, got ${transfer.amount}`);

  const total = already + incoming;
  const paidInFull = total >= due;
  const overpaidBy = paidInFull ? total - due : 0;

  return {
    status: paidInFull ? 'PAID' : 'PARTIAL',
    amountPaid: fromBaseUnits(total, decimals),
    remaining: fromBaseUnits(paidInFull ? 0 : due - total, decimals),
    overpaid: overpaidBy > 0,
    overpaidBy: fromBaseUnits(overpaidBy, decimals),
  };
}
