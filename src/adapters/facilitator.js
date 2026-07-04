// x402 facilitator adapter — verify + settle payment payloads.
//
// Mirrors the project's other adapters (chain/email/llm): the mock rail is a
// complete in-process implementation so the whole x402 handshake runs with
// zero credentials; the real rail documents the intended OKX facilitator call
// and FAILS FAST when credentials are missing instead of guessing.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ IMPORTANT — two distinct payment layers (do not conflate):              │
// │   1. x402 SERVICE FEE (this file): the FREELANCER pays PaidFast 1 USDT  │
// │      per invoice issued, settled instantly per call via HTTP 402.       │
// │   2. THE INVOICE ITSELF: the freelancer's CLIENT pays it on X Layer;    │
// │      that is watched by src/adapters/chain.js and never touches x402.   │
// └─────────────────────────────────────────────────────────────────────────┘
//
// MOCK MODE (X402_MODE=mock)
//   verify(): payload must be an object (i.e. the PAYMENT-SIGNATURE or legacy
//   X-PAYMENT header decoded to valid base64 JSON), scheme + network must
//   match the requirements, and the
//   declared amount must be >= maxAmountRequired (compared as BigInt).
//   settle(): deterministic receipt — transaction = 0x + sha256(payload JSON),
//   so re-settling the same payload yields the same tx hash (idempotent demos).
//
// REAL MODE (X402_MODE=real) — OKX x402 facilitator
//   POST https://web3.okx.com/api/v6/pay/x402/verify   body {paymentPayload, paymentRequirements}
//   POST https://web3.okx.com/api/v6/pay/x402/settle   body {paymentPayload, paymentRequirements}
//   Auth: OKX v5-style HMAC signing from env
//     OKX_X402_API_KEY / OKX_X402_SECRET / OKX_X402_PASSPHRASE
//   ── ASSUMED header names, pending confirmation against current OKX docs ──
//     OK-ACCESS-KEY:        the API key
//     OK-ACCESS-SIGN:       base64(hmacSHA256(timestamp + method + requestPath + body, secret))
//     OK-ACCESS-TIMESTAMP:  ISO-8601 UTC timestamp used in the signature
//     OK-ACCESS-PASSPHRASE: the API passphrase
//   Alternative (needs npm deps, so out of scope for this zero-dep repo):
//   OKX's official SDKs @okxweb3/x402-core / x402-express / x402-evm wrap this
//   handshake — see STATUS.md.

import crypto from 'node:crypto';
import { NotConfiguredError, sha256hex } from '../util.js';

const BASE_URL = process.env.OKX_X402_BASE_URL || 'https://web3.okx.com';
const VERIFY_PATH = '/api/v6/pay/x402/verify';
const SETTLE_PATH = '/api/v6/pay/x402/settle';

/* ============================================================ public API */

/**
 * Verify a decoded PaymentPayload against PaymentRequirements.
 * Returns { isValid, invalidReason?, payer? }.
 * `mode` is passed in by the gate ("mock" | "real") — this adapter never
 * decides the mode itself.
 */
export async function verify(mode, paymentPayload, paymentRequirements) {
  if (mode === 'mock') return mockVerify(paymentPayload, paymentRequirements);
  if (mode === 'real') return realPost(VERIFY_PATH, paymentPayload, paymentRequirements);
  throw new Error(`facilitator.verify: unsupported mode "${mode}".`);
}

/**
 * Settle a verified payment. Returns a receipt:
 * { success, transaction, network, payer, status } (+ error on failure).
 */
export async function settle(mode, paymentPayload, paymentRequirements) {
  if (mode === 'mock') return mockSettle(paymentPayload, paymentRequirements);
  if (mode === 'real') return realPost(SETTLE_PATH, paymentPayload, paymentRequirements);
  throw new Error(`facilitator.settle: unsupported mode "${mode}".`);
}

/* ============================================================= mock rail */

/** Declared amount can live at payload.authorization.value (EIP-3009 style),
 *  payload.value, or top level — accept the first present. */
function declaredAmount(p) {
  return p?.payload?.authorization?.value ?? p?.payload?.value ?? p?.value ?? null;
}

/** Payer address, same tolerant lookup. */
function payerOf(p) {
  return p?.payload?.authorization?.from ?? p?.payload?.from ?? p?.from ?? null;
}

function mockVerify(p, req) {
  const invalid = (reason) => ({ isValid: false, invalidReason: reason });

  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return invalid('Payment header did not decode to a JSON PaymentPayload object.');
  }
  if (p.scheme !== req.scheme) {
    return invalid(`scheme mismatch: expected "${req.scheme}", got "${p.scheme}".`);
  }
  if (p.network !== req.network) {
    return invalid(`network mismatch: expected "${req.network}", got "${p.network}".`);
  }

  const declared = declaredAmount(p);
  let declaredUnits;
  try {
    declaredUnits = BigInt(String(declared));
  } catch {
    return invalid('payment payload declares no parseable amount.');
  }
  if (declaredUnits < BigInt(req.maxAmountRequired)) {
    return invalid(
      `declared amount ${declaredUnits} is below required ${req.maxAmountRequired} base units.`,
    );
  }

  return { isValid: true, payer: payerOf(p) };
}

function mockSettle(p, req) {
  return {
    success: true,
    // Deterministic 64-hex tx hash from the payload itself — same payload,
    // same "transaction". Clearly fake, obviously reproducible.
    transaction: '0x' + sha256hex(JSON.stringify(p)),
    network: req.network,
    payer: payerOf(p),
    status: 'success',
  };
}

/* ============================================================= real rail */

function requireCreds() {
  const key = process.env.OKX_X402_API_KEY;
  const secret = process.env.OKX_X402_SECRET;
  const passphrase = process.env.OKX_X402_PASSPHRASE;
  if (!key || !secret || !passphrase) {
    // Fail fast — never call the facilitator half-configured.
    throw new NotConfiguredError('x402 real mode is missing OKX facilitator credentials.', [
      'Set OKX_X402_API_KEY, OKX_X402_SECRET and OKX_X402_PASSPHRASE.',
      'Also set X402_PAY_TO to the wallet that receives the 1 USDT service fee.',
      'Alternative: use the official OKX SDKs (@okxweb3/x402-core / x402-express /',
      '@okxweb3/x402-evm) instead of this hand-rolled client — see STATUS.md.',
    ]);
  }
  return { key, secret, passphrase };
}

/** OKX v5-style request signing (header names ASSUMED — see file header). */
function okxHeaders({ key, secret, passphrase }, method, requestPath, body) {
  const timestamp = new Date().toISOString();
  const sign = crypto
    .createHmac('sha256', secret)
    .update(timestamp + method + requestPath + body)
    .digest('base64');
  return {
    'content-type': 'application/json',
    'OK-ACCESS-KEY': key,          // ASSUMED header name — confirm in OKX docs
    'OK-ACCESS-SIGN': sign,        // ASSUMED header name — confirm in OKX docs
    'OK-ACCESS-TIMESTAMP': timestamp, // ASSUMED — confirm in OKX docs
    'OK-ACCESS-PASSPHRASE': passphrase, // ASSUMED — confirm in OKX docs
  };
}

async function realPost(requestPath, paymentPayload, paymentRequirements) {
  const creds = requireCreds();
  const body = JSON.stringify({ paymentPayload, paymentRequirements });
  const res = await fetch(BASE_URL + requestPath, {
    method: 'POST',
    headers: okxHeaders(creds, 'POST', requestPath, body),
    body,
  });
  if (!res.ok) {
    throw new Error(`OKX x402 facilitator HTTP ${res.status} from ${requestPath}`);
  }
  // Response shape ASSUMED to match the x402 facilitator spec
  // ({isValid,...} for verify, {success, transaction,...} for settle) —
  // verify against current OKX docs when creds exist.
  return res.json();
}
