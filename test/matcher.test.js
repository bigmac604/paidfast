// Payment matching: exact / partial / over, plus transfer→invoice attribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { transferMatchesInvoice, applyPayment } from '../src/matcher.js';

const invoice = (over = {}) => ({
  id: 'INV-2026-0001',
  reference: 'PF-K7Q2M4RA',
  token: 'USDT',
  amount: 500,
  amountPaid: 0,
  address: '0xAbCd000000000000000000000000000000001234',
  status: 'SENT',
  ...over,
});

const transfer = (over = {}) => ({
  txHash: '0xdeadbeef',
  from: '0xpayer',
  to: '0xabcd000000000000000000000000000000001234',
  token: 'USDT',
  amount: 500,
  reference: 'PF-K7Q2M4RA',
  ...over,
});

test('exact payment settles the invoice: PAID, nothing remaining, not overpaid', () => {
  const out = applyPayment(invoice(), transfer());
  assert.equal(out.status, 'PAID');
  assert.equal(out.amountPaid, 500);
  assert.equal(out.remaining, 0);
  assert.equal(out.overpaid, false);
  assert.equal(out.overpaidBy, 0);
});

test('underpayment goes PARTIAL with the remaining balance computed', () => {
  const out = applyPayment(invoice(), transfer({ amount: 200 }));
  assert.equal(out.status, 'PARTIAL');
  assert.equal(out.amountPaid, 200);
  assert.equal(out.remaining, 300);
  assert.equal(out.overpaid, false);
});

test('a second partial payment that completes the total flips to PAID', () => {
  const out = applyPayment(invoice({ amountPaid: 200, status: 'PARTIAL' }), transfer({ amount: 300 }));
  assert.equal(out.status, 'PAID');
  assert.equal(out.amountPaid, 500);
  assert.equal(out.remaining, 0);
  assert.equal(out.overpaid, false);
});

test('overpayment is PAID and flagged with the exact excess', () => {
  const out = applyPayment(invoice(), transfer({ amount: 550 }));
  assert.equal(out.status, 'PAID');
  assert.equal(out.overpaid, true);
  assert.equal(out.overpaidBy, 50);
  assert.equal(out.remaining, 0);
});

test('overpayment across multiple transfers is also flagged', () => {
  const out = applyPayment(invoice({ amountPaid: 400, status: 'PARTIAL' }), transfer({ amount: 150 }));
  assert.equal(out.status, 'PAID');
  assert.equal(out.overpaidBy, 50);
});

test('float-noise amounts settle exactly (0.1 + 0.2 pays a 0.3 invoice)', () => {
  const inv = invoice({ amount: 0.3 });
  const first = applyPayment(inv, transfer({ amount: 0.1 }));
  assert.equal(first.status, 'PARTIAL');
  assert.equal(first.remaining, 0.2);
  const second = applyPayment({ ...inv, amountPaid: first.amountPaid }, transfer({ amount: 0.2 }));
  assert.equal(second.status, 'PAID'); // would fail with naive float compare
  assert.equal(second.overpaid, false);
  assert.equal(second.remaining, 0);
});

test('six-decimal token amounts survive the round trip', () => {
  const out = applyPayment(invoice({ amount: 123.456789 }), transfer({ amount: 123.456789 }));
  assert.equal(out.status, 'PAID');
  assert.equal(out.overpaid, false);
});

test('zero/negative transfers are rejected loudly', () => {
  assert.throws(() => applyPayment(invoice(), transfer({ amount: 0 })));
  assert.throws(() => applyPayment(invoice(), transfer({ amount: -5 })));
});

test('matching: deposit-address match is case-insensitive', () => {
  const t = transfer({ reference: null, to: '0xABCD000000000000000000000000000000001234' });
  assert.equal(transferMatchesInvoice(invoice(), t), true);
});

test('matching: reference alone matches (shared-address strategy)', () => {
  const t = transfer({ to: '0xsomewhere-else' });
  assert.equal(transferMatchesInvoice(invoice(), t), true);
});

test('matching: wrong token never matches, even with right address+reference', () => {
  assert.equal(transferMatchesInvoice(invoice(), transfer({ token: 'USDC' })), false);
});

test('matching: unrelated transfer (wrong address, wrong reference) is ignored', () => {
  const t = transfer({ to: '0x9999', reference: 'PF-OTHERONE' });
  assert.equal(transferMatchesInvoice(invoice(), t), false);
});
