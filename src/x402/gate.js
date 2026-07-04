// x402 gate — HTTP 402 pay-per-call handshake for the listed A2MCP service.
//
// Gates EXACTLY ONE route: POST /api/invoices (invoice creation, the thing
// OKX.AI lists at 1 USDT per call). Dashboard pages, invoice/receipt views,
// GET /api/*, /api/watch, /api/remind and /api/health all stay free.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ TWO PAYMENT LAYERS — keep them straight:                                │
// │   x402 (here):  the FREELANCER pays a 1 USDT service fee per invoice    │
// │                 issued, settled instantly per call.                     │
// │   the invoice:  the freelancer's CLIENT pays it on X Layer later; that  │
// │                 is chain.js / matcher.js territory, never x402.         │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Protocol (x402 v1, scheme "exact", network eip155:196 = X Layer mainnet):
//   client → POST /api/invoices                      (no payment header)
//   server → 402 + PAYMENT-REQUIRED: base64(JSON {x402Version, resource, accepts})
//            (the FULL challenge object — the validator decodes the header and
//            reads accepts[]; a bare PaymentRequirements → "accepts is empty")
//   client → POST /api/invoices + PAYMENT-SIGNATURE: base64(JSON PaymentPayload)
//            (v2 replay header, checked FIRST; legacy X-PAYMENT still accepted)
//   server → facilitator.verify() → facilitator.settle()
//            success → run the normal create handler, reply 201 +
//                      PAYMENT-RESPONSE: base64(JSON settlement receipt)
//            failure → 402 with an `error` field (challenge re-attached)
//
// X402_MODE: "off" (default) | "mock" | "real"
//   off  → gate is transparent; every route behaves exactly as before x402.
//   mock → full handshake against the in-process facilitator (no credentials).
//   real → OKX facilitator over HTTPS (see src/adapters/facilitator.js).
// Read at call time (not import time) so tests and demos can flip it freely.

import { verify, settle } from '../adapters/facilitator.js';

/** 1 USDT service fee in base units (USDT on X Layer has 6 decimals). */
export const FEE_BASE_UNITS = String(1 * 10 ** 6); // "1000000"

/** Current gate mode; anything unrecognized degrades safely to "off". */
export function x402Mode() {
  const v = String(process.env.X402_MODE || 'off').toLowerCase();
  return ['off', 'mock', 'real'].includes(v) ? v : 'off';
}

/** The PaymentRequirements challenge for POST /api/invoices. */
export function buildPaymentRequirements() {
  return {
    x402Version: 1,
    scheme: 'exact',
    network: 'eip155:196', // X Layer mainnet
    maxAmountRequired: FEE_BASE_UNITS, // 1 USDT × 10^6
    resource: '/api/invoices',
    description: 'Issue a tracked crypto invoice with payment watching and reminders',
    mimeType: 'application/json',
    payTo: process.env.X402_PAY_TO || '0xREPLACE_OWNER_WALLET',
    maxTimeoutSeconds: 60,
    asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736', // USDT on X Layer
    extra: { name: 'USDT', decimals: 6 },
  };
}

export function encodeB64Json(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

/** Returns the decoded object, or null when not valid base64 JSON. */
export function decodeB64Json(s) {
  try {
    const parsed = JSON.parse(Buffer.from(String(s ?? ''), 'base64').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Build the full x402 challenge object carried (base64) in PAYMENT-REQUIRED.
 * Validators decode this header and read `accepts[]` from it — encoding a bare
 * PaymentRequirements object gets rejected as "accepts is empty".
 */
export function buildChallenge(requirements = buildPaymentRequirements()) {
  return {
    x402Version: 1,
    resource: requirements.resource,
    accepts: [requirements],
  };
}

/**
 * Evaluate the x402 gate for one invoice-creation request.
 *
 *   const gate = await gateInvoiceCreation(req.headers);
 *   if (!gate.ok) → respond gate.status with gate.headers + gate.body
 *   else          → run the normal handler; attach gate.headers to the reply
 *
 * `headers` is Node's lowercase req.headers map. The payment retry is read
 * from PAYMENT-SIGNATURE first (v2 — what `onchainos payment pay` replays
 * with), falling back to legacy X-PAYMENT; both carry base64(JSON
 * PaymentPayload).
 *
 * Never throws for bad *payments* (those become 402s); only throws for
 * operational errors (e.g. real mode without credentials → NotConfiguredError,
 * surfaced by the server as 501 like every other unwired adapter).
 */
export async function gateInvoiceCreation(headers = {}) {
  const mode = x402Mode();
  if (mode === 'off') return { ok: true, mode, headers: {} };

  const requirements = buildPaymentRequirements();
  const challengePayload = buildChallenge(requirements);
  const challenge = (error) => ({
    ok: false,
    mode,
    status: 402,
    headers: { 'PAYMENT-REQUIRED': encodeB64Json(challengePayload) },
    body: {
      ok: false,
      x402Version: 1,
      resource: requirements.resource,
      error,
      accepts: [requirements],
    },
  });

  // v2 (PAYMENT-SIGNATURE, the `onchainos payment pay` replay header) first,
  // legacy v1 X-PAYMENT second. Same base64-JSON decode either way.
  const paymentHeader = headers['payment-signature'] ?? headers['x-payment'];
  if (!paymentHeader) {
    return challenge('Payment required: 1 USDT per invoice issued (x402). Sign an accepts[] entry from the PAYMENT-REQUIRED challenge and retry with PAYMENT-SIGNATURE (or legacy X-PAYMENT).');
  }

  const paymentPayload = decodeB64Json(paymentHeader);
  if (!paymentPayload) {
    return challenge('Payment header is not valid base64-encoded JSON.');
  }

  const verdict = await verify(mode, paymentPayload, requirements);
  if (!verdict.isValid) {
    return challenge(`Payment verification failed: ${verdict.invalidReason || 'rejected by facilitator.'}`);
  }

  const receipt = await settle(mode, paymentPayload, requirements);
  if (!receipt.success) {
    return challenge(`Payment settlement failed: ${receipt.error || receipt.errorReason || 'rejected by facilitator.'}`);
  }

  return {
    ok: true,
    mode,
    receipt,
    headers: { 'PAYMENT-RESPONSE': encodeB64Json(receipt) },
  };
}
