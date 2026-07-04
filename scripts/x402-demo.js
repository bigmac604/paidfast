// x402 demo — the pay-per-call handshake, end to end, zero credentials.
//
//   npm run x402-demo
//
//   1. POST /api/invoices with NO payment → HTTP 402 + PAYMENT-REQUIRED header
//      carrying base64 of the FULL challenge {x402Version, resource, accepts}
//   2. decode the challenge, pick accepts[0], build a mock PaymentPayload (1 USDT)
//   3. retry with PAYMENT-SIGNATURE (v2 replay header) → verify + settle →
//      201 + PAYMENT-RESPONSE receipt and the invoice is actually created.
//
// Runs an in-process server on an ephemeral port with X402_MODE=mock and its
// OWN demo state files (state/x402-demo-*.json), reset every run — it can
// never touch your real invoices (same isolation trick as scripts/demo.js).
//
// Reminder of the two layers: this 1 USDT is the freelancer's SERVICE FEE for
// issuing an invoice via the listed A2MCP endpoint. The invoice itself gets
// paid by the freelancer's client on X Layer later — a separate rail entirely.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Must happen BEFORE importing src modules (config reads env at import time).
process.env.OKX_MODE = 'mock';
process.env.X402_MODE = 'mock';
process.env.PAIDFAST_STATE_FILE = path.join(ROOT, 'state', 'x402-demo-invoices.json');
process.env.PAIDFAST_MOCK_CHAIN_FILE = path.join(ROOT, 'state', 'x402-demo-mock-chain.json');
fs.rmSync(process.env.PAIDFAST_STATE_FILE, { force: true });
fs.rmSync(process.env.PAIDFAST_MOCK_CHAIN_FILE, { force: true });

const { c, sym } = await import('../src/util.js');
const { createPaidfastServer } = await import('../src/server.js');
const { decodeB64Json, encodeB64Json } = await import('../src/x402/gate.js');

const say = (msg) => console.log(`  ${msg}`);
const head = (title) => {
  console.log('');
  console.log(`  ${c.bold(c.magenta(title))}`);
  console.log(`  ${c.dim(sym.hr())}`);
};

const server = createPaidfastServer();
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

console.log('');
console.log(`  ${c.bold(`${sym.bolt} PAIDFAST x402 demo`)} ${c.dim(`· X402_MODE=mock · in-process server on ${base}`)}`);
console.log(`  ${c.dim('The listed A2MCP service: POST /api/invoices at 1 USDT per call, settled per-request via HTTP 402.')}`);

const invoiceBody = JSON.stringify({
  client: 'Acme Studio',
  email: 'billing@acme.example',
  amount: 500,
  description: 'landing page redesign',
  due: '7d',
});

try {
  /* ---------------------------------------------- step 1: unpaid call → 402 */

  head('STEP 1 · Call the gated route with no payment');
  const r1 = await fetch(`${base}/api/invoices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: invoiceBody,
  });
  say(`POST /api/invoices ${sym.arrow} ${c.bold(`HTTP ${r1.status}`)} ${r1.status === 402 ? c.green('(payment required — as designed)') : c.red('(expected 402!)')}`);
  if (r1.status !== 402) throw new Error(`expected 402, got ${r1.status}`);

  const challengeB64 = r1.headers.get('payment-required');
  const challenge = decodeB64Json(challengeB64);
  if (!challenge) throw new Error('402 carried no decodable PAYMENT-REQUIRED header');
  if (!Array.isArray(challenge.accepts) || challenge.accepts.length === 0) {
    throw new Error('PAYMENT-REQUIRED challenge has an empty accepts[] — spec violation');
  }
  const requirements = challenge.accepts[0];
  say(`decoded ${c.cyan('PAYMENT-REQUIRED')} challenge (x402Version=${challenge.x402Version} · resource=${challenge.resource} · accepts[${challenge.accepts.length}]) — using accepts[0]:`);
  say(c.dim(`  scheme=${requirements.scheme} · network=${requirements.network} · fee=${requirements.maxAmountRequired} base units`));
  say(c.dim(`  (${Number(requirements.maxAmountRequired) / 10 ** requirements.extra.decimals} ${requirements.extra.name}) · payTo=${requirements.payTo}`));
  say(c.dim(`  resource=${requirements.resource} · asset=${requirements.asset}`));

  /* --------------------------------------- step 2: build the mock payment */

  head('STEP 2 · Build a PaymentPayload for exactly that challenge');
  const nowSec = Math.floor(Date.now() / 1000);
  const paymentPayload = {
    x402Version: 1,
    scheme: requirements.scheme,
    network: requirements.network,
    payload: {
      // Mock EIP-3009-shaped authorization; a real client would sign this.
      signature: '0x' + 'ab'.repeat(65),
      authorization: {
        from: '0x00000000000000000000000000000000f2ee1a2c', // the freelancer's wallet
        to: requirements.payTo,
        value: requirements.maxAmountRequired, // pay the full 1 USDT fee
        validAfter: String(nowSec - 60),
        validBefore: String(nowSec + requirements.maxTimeoutSeconds),
        nonce: '0x' + '11'.repeat(32),
      },
    },
  };
  say(`payer ${c.cyan(paymentPayload.payload.authorization.from)} authorizes ${c.bold('1 USDT')} to ${c.cyan(requirements.payTo)}`);

  /* -------------------------------------------- step 3: retry with payment */

  head('STEP 3 · Retry with PAYMENT-SIGNATURE — verify, settle, deliver');
  const r2 = await fetch(`${base}/api/invoices`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'PAYMENT-SIGNATURE': encodeB64Json(paymentPayload),
    },
    body: invoiceBody,
  });
  say(`POST /api/invoices + PAYMENT-SIGNATURE ${sym.arrow} ${c.bold(`HTTP ${r2.status}`)} ${r2.status === 201 ? c.green(`${sym.ok} paid call accepted`) : c.red('(expected 201!)')}`);
  if (r2.status !== 201) throw new Error(`expected 201, got ${r2.status}: ${await r2.text()}`);

  const receipt = decodeB64Json(r2.headers.get('payment-response'));
  if (!receipt?.success) throw new Error('201 carried no decodable PAYMENT-RESPONSE receipt');
  const result = await r2.json();

  say(`decoded ${c.cyan('PAYMENT-RESPONSE')} settlement receipt:`);
  say(c.dim(`  success=${receipt.success} · status=${receipt.status} · network=${receipt.network}`));
  say(c.dim(`  payer=${receipt.payer}`));
  say(c.dim(`  transaction=${receipt.transaction}`));
  say(`invoice created: ${c.bold(result.invoice.id)} ${c.dim(`(${result.invoice.reference} · ${result.invoice.client} · ${result.invoice.amount} ${result.invoice.token})`)}`);

  /* ------------------------------------------------------------- summary */

  console.log('');
  console.log(`  ${c.dim(sym.hr())}`);
  console.log(`  ${c.bold(`${sym.ok} x402 round trip complete:`)} 402 challenge ${sym.arrow} mock payment ${sym.arrow} verify ${sym.arrow} settle ${sym.arrow} invoice ${result.invoice.id}`);
  console.log(`  ${c.dim('Service fee (freelancer → PaidFast, x402) and the invoice (client → freelancer, X Layer) are separate rails.')}`);
  console.log(`  ${c.dim('Real facilitator wiring: X402_MODE=real + OKX_X402_* creds — see STATUS.md.')}`);
  console.log('');
} finally {
  server.close();
}
