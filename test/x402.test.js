// x402 pay-per-call gate: off-mode passthrough, challenge shape, amount math,
// mock verify/settle round trip, and bad-payment rejection.
//
// The gate reads X402_MODE at call time, so each test pins the env var and
// restores it afterwards — no cross-test leakage, no HTTP server needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gateInvoiceCreation, buildPaymentRequirements, encodeB64Json, decodeB64Json,
  x402Mode, FEE_BASE_UNITS,
} from '../src/x402/gate.js';
import { verify, settle } from '../src/adapters/facilitator.js';

function withMode(mode, fn) {
  return async () => {
    const prev = process.env.X402_MODE;
    if (mode == null) delete process.env.X402_MODE;
    else process.env.X402_MODE = mode;
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env.X402_MODE;
      else process.env.X402_MODE = prev;
    }
  };
}

/** A well-formed mock PaymentPayload paying `value` base units. */
const payload = (over = {}) => ({
  x402Version: 1,
  scheme: 'exact',
  network: 'eip155:196',
  payload: {
    signature: '0x' + 'ab'.repeat(65),
    authorization: {
      from: '0x00000000000000000000000000000000f2ee1a2c',
      to: '0xREPLACE_OWNER_WALLET',
      value: '1000000',
      nonce: '0x' + '11'.repeat(32),
    },
  },
  ...over,
});

/* ------------------------------------------------------ off-mode passthrough */

test('X402_MODE unset defaults to off and the gate is transparent', withMode(null, async () => {
  assert.equal(x402Mode(), 'off');
  const gate = await gateInvoiceCreation({});
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.headers, {});
  assert.equal(gate.receipt, undefined);
}));

test('off mode ignores even garbage payment headers (no verification happens)', withMode('off', async () => {
  const gate = await gateInvoiceCreation({ 'payment-signature': '!!!not-base64!!!', 'x-payment': '!!!not-base64!!!' });
  assert.equal(gate.ok, true);
}));

test('unrecognized X402_MODE degrades safely to off', withMode('banana', async () => {
  assert.equal(x402Mode(), 'off');
  assert.equal((await gateInvoiceCreation({})).ok, true);
}));

/* ---------------------------------------------------------- challenge shape */

test('mock mode without payment returns a 402 whose header decodes to the FULL challenge', withMode('mock', async () => {
  const gate = await gateInvoiceCreation({});
  assert.equal(gate.ok, false);
  assert.equal(gate.status, 402);
  assert.equal(typeof gate.body.error, 'string');

  // The header carries the full challenge object {x402Version, resource,
  // accepts}, NOT a bare PaymentRequirements — validators read accepts[].
  const challenge = decodeB64Json(gate.headers['PAYMENT-REQUIRED']);
  assert.ok(challenge, 'PAYMENT-REQUIRED must be base64 JSON');
  assert.equal(challenge.x402Version, 1);
  assert.equal(challenge.resource, '/api/invoices');
  assert.ok(Array.isArray(challenge.accepts) && challenge.accepts.length === 1, 'accepts[] must be non-empty');

  const req = challenge.accepts[0];
  assert.equal(req.x402Version, 1);
  assert.equal(req.scheme, 'exact');
  assert.equal(req.network, 'eip155:196');
  assert.equal(req.maxAmountRequired, '1000000');
  assert.equal(req.resource, '/api/invoices');
  assert.equal(req.mimeType, 'application/json');
  assert.equal(req.maxTimeoutSeconds, 60);
  assert.equal(req.asset, '0x779ded0c9e1022225f8e0630b35a9b54be713736');
  assert.deepEqual(req.extra, { name: 'USDT', decimals: 6 });

  // body echoes the same challenge for clients that don't read headers
  assert.equal(gate.body.x402Version, 1);
  assert.equal(gate.body.resource, '/api/invoices');
  assert.deepEqual(gate.body.accepts, [req]);
}));

test('payTo comes from X402_PAY_TO with a loud placeholder default', () => {
  const prev = process.env.X402_PAY_TO;
  try {
    delete process.env.X402_PAY_TO;
    assert.equal(buildPaymentRequirements().payTo, '0xREPLACE_OWNER_WALLET');
    process.env.X402_PAY_TO = '0x1234000000000000000000000000000000005678';
    assert.equal(buildPaymentRequirements().payTo, '0x1234000000000000000000000000000000005678');
  } finally {
    if (prev === undefined) delete process.env.X402_PAY_TO;
    else process.env.X402_PAY_TO = prev;
  }
});

/* -------------------------------------------------------------- amount math */

test('fee is exactly 1 USDT in 6-decimal base units', () => {
  assert.equal(FEE_BASE_UNITS, '1000000');
  assert.equal(buildPaymentRequirements().maxAmountRequired, String(1 * 10 ** 6));
});

test('mock verify: declared amount must be >= required (BigInt compare, no float)', async () => {
  const req = buildPaymentRequirements();
  const at = (value) => payload({ payload: { authorization: { from: '0xf', value } } });

  assert.equal((await verify('mock', at('1000000'), req)).isValid, true);  // exact
  assert.equal((await verify('mock', at('2500000'), req)).isValid, true);  // over
  const short = await verify('mock', at('999999'), req);                   // 1 unit short
  assert.equal(short.isValid, false);
  assert.match(short.invalidReason, /below required/);
});

/* ---------------------------------------------------------- mock round trip */

test('mock round trip: PAYMENT-SIGNATURE (v2) verifies, settles, and yields a receipt header', withMode('mock', async () => {
  const gate = await gateInvoiceCreation({ 'payment-signature': encodeB64Json(payload()) });
  assert.equal(gate.ok, true);
  assert.equal(gate.receipt.success, true);
  assert.equal(gate.receipt.status, 'success');
  assert.equal(gate.receipt.network, 'eip155:196');
  assert.equal(gate.receipt.payer, '0x00000000000000000000000000000000f2ee1a2c');
  assert.match(gate.receipt.transaction, /^0x[0-9a-f]{64}$/);

  const echoed = decodeB64Json(gate.headers['PAYMENT-RESPONSE']);
  assert.deepEqual(echoed, gate.receipt);
}));

test('legacy X-PAYMENT is still accepted as the fallback payment header', withMode('mock', async () => {
  const gate = await gateInvoiceCreation({ 'x-payment': encodeB64Json(payload()) });
  assert.equal(gate.ok, true);
  assert.equal(gate.receipt.success, true);
  assert.ok(gate.headers['PAYMENT-RESPONSE']);
}));

test('PAYMENT-SIGNATURE takes precedence over X-PAYMENT when both are present', withMode('mock', async () => {
  const gate = await gateInvoiceCreation({
    'payment-signature': encodeB64Json(payload()),
    'x-payment': 'garbage-that-would-fail-decoding',
  });
  assert.equal(gate.ok, true, 'valid v2 header must win over the broken legacy one');
}));

test('mock settle is deterministic: same payload, same transaction hash', async () => {
  const req = buildPaymentRequirements();
  const p = payload();
  const a = await settle('mock', p, req);
  const b = await settle('mock', p, req);
  assert.equal(a.transaction, b.transaction);
  const c = await settle('mock', payload({ network: 'eip155:196', payload: { authorization: { from: '0xother', value: '1000000' } } }), req);
  assert.notEqual(a.transaction, c.transaction);
});

/* ------------------------------------------------------ bad-payment rejects */

test('bad payments are rejected with 402 + error and the challenge re-attached', withMode('mock', async () => {
  const cases = [
    ['not base64 JSON', 'garbage-not-base64-json'],
    ['base64 of a non-object', encodeB64Json('just a string') /* decodes to string → rejected */],
    ['wrong scheme', encodeB64Json(payload({ scheme: 'streaming' }))],
    ['wrong network', encodeB64Json(payload({ network: 'eip155:1' }))],
    ['amount below fee', encodeB64Json(payload({ payload: { authorization: { from: '0xf', value: '500000' } } }))],
    ['no amount at all', encodeB64Json(payload({ payload: { authorization: { from: '0xf' } } }))],
  ];
  for (const [label, header] of cases) {
    // Exercised via both the v2 and the legacy header slot.
    for (const slot of ['payment-signature', 'x-payment']) {
      const gate = await gateInvoiceCreation({ [slot]: header });
      assert.equal(gate.ok, false, `${label} (${slot})`);
      assert.equal(gate.status, 402, `${label} (${slot})`);
      assert.equal(typeof gate.body.error, 'string', `${label} (${slot})`);
      const challenge = decodeB64Json(gate.headers['PAYMENT-REQUIRED']);
      assert.ok(challenge?.accepts?.length, `${label} (${slot}): challenge re-attached with accepts[]`);
    }
  }
}));

test('real mode without credentials fails fast (NotConfiguredError, never a silent call)', withMode('real', async () => {
  const saved = {};
  for (const k of ['OKX_X402_API_KEY', 'OKX_X402_SECRET', 'OKX_X402_PASSPHRASE']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    await assert.rejects(
      gateInvoiceCreation({ 'payment-signature': encodeB64Json(payload()) }),
      (err) => err.name === 'NotConfiguredError',
    );
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
}));
