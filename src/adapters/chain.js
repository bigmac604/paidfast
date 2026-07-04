// Chain adapter — X Layer payment watching + post-payment sweep.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ MOCK MODE (default, OKX_MODE=mock)                                      │
// │   Simulated USDT/USDC transfers "arrive" on a configurable watch pass.  │
// │   Scenarios: full | partial (60% then the rest) | over (110%).          │
// │   Per-invoice check counters persist in state/mock-chain.json.          │
// │                                                                         │
// │ REAL MODE (OKX_MODE=real) — STUB, no credentials/wallets exist yet      │
// │   Preferred rail: OKX Onchain OS skills                                 │
// │     `npx skills add okx/onchainos-skills` is expected to install EVM    │
// │     skills incl. X Layer payment detection (watch address / query       │
// │     token transfers). OPEN QUESTION for the rails scout: exact skill    │
// │     names, invocation API, and whether it exposes a push subscription   │
// │     or a poll interface. This adapter is the seam — wire it inside      │
// │     realCheckForTransfers() below without touching the rest of the app. │
// │                                                                         │
// │   Fallback rail (documented AND implemented below, UNTESTED):           │
// │     Poll X Layer JSON-RPC `eth_getLogs` for ERC-20 Transfer events      │
// │     filtered to our deposit address:                                    │
// │       topic0 = keccak256("Transfer(address,address,uint256)")           │
// │              = 0xddf252ad...23b3ef                                      │
// │       topic2 = 0x000...000<our address>  (indexed `to`)                 │
// │       address = the token contract (USDT/USDC on X Layer)               │
// │     Placeholders to fill (env vars, see src/config.js):                 │
// │       XLAYER_RPC_URL        default https://rpc.xlayer.tech   (VERIFY)  │
// │       XLAYER_CHAIN_ID       default 196 mainnet / 195 testnet (VERIFY)  │
// │       XLAYER_USDT_ADDRESS   verify on https://www.oklink.com/xlayer     │
// │       XLAYER_USDC_ADDRESS   verify on https://www.oklink.com/xlayer     │
// │       PAIDFAST_RECEIVE_ADDRESS  our receiving wallet                    │
// │                                                                         │
// │   Matching strategy on real EVM rails (ERC-20 has NO memo field, so a   │
// │   "payment reference" cannot ride on the transfer itself). Options:     │
// │     A. Unique deposit address per invoice (HD-derive from an xpub;      │
// │        what the mock simulates) — cleanest, needs sweep consolidation.  │
// │     B. Amount fingerprinting: bill 500.013927 instead of 500.00 so the  │
// │        exact amount identifies the invoice at a shared address.         │
// │     C. Known-sender matching: client registers their wallet address.    │
// │   DECISION NEEDED (open question in STATUS.md). Mock uses A + carries   │
// │   the reference on the simulated transfer for readable demos.           │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Adapter surface (used by commands/watch.js and receipts.js):
//   getDepositAddress(reference)  -> "0x…" for a new invoice
//   checkForTransfers(invoice, opts) -> { checkNumber, transfers: Transfer[] }
//   sweepToStables(invoice)       -> { swept, mode, note, at }
//
// Transfer shape: { txHash, from, to, token, amount, reference?, blockNumber, at }

import fs from 'node:fs';
import path from 'node:path';
import { MODE, MOCK, CHAIN, PATHS, now, normalizeScenario } from '../config.js';
import {
  NotConfiguredError, sha256hex, randomTxHash, formatAmount,
  toBaseUnits, fromBaseUnits,
} from '../util.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/* ============================================================ public API */

/**
 * Deposit address for a new invoice.
 * Mock: deterministic fake address derived from the payment reference —
 * simulates strategy A (unique address per invoice).
 * Real: derive from an HD wallet xpub (per-invoice) or fall back to the fixed
 * PAIDFAST_RECEIVE_ADDRESS (then matching needs strategy B or C — see header).
 */
export function getDepositAddress(reference) {
  if (MODE === 'mock') {
    return '0x' + sha256hex(`paidfast-deposit:${reference}`).slice(0, 40);
  }
  if (CHAIN.receiveAddress) return CHAIN.receiveAddress;
  throw new NotConfiguredError('Real mode has no receiving address configured.', [
    'Set PAIDFAST_RECEIVE_ADDRESS to your X Layer wallet address, or',
    'implement HD per-invoice derivation here (preferred — see file header).',
  ]);
}

/**
 * One watch pass for one invoice. Returns matching-candidate transfers
 * (the caller runs them through src/matcher.js — adapter stays dumb).
 */
export async function checkForTransfers(invoice, opts = {}) {
  if (MODE === 'mock') return mockCheckForTransfers(invoice, opts);
  return realCheckForTransfers(invoice, opts);
}

/**
 * Post-payment sweep step: convert/consolidate incoming funds to stables.
 * Payments already arrive in USDT/USDC, so this is a consolidation hook —
 * and the seam where volatile-token support would plug in later.
 */
export async function sweepToStables(invoice) {
  if (MODE === 'mock') {
    const note =
      `swept ${formatAmount(invoice.amountPaid)} ${invoice.token} ` +
      `from deposit address to treasury (already a stablecoin — no conversion needed)`;
    return { swept: true, mode: 'mock', note, at: now().toISOString() };
  }

  // REAL-MODE STUB — documents the intended OKX call, then refuses politely.
  throw new NotConfiguredError('Sweep is not wired for real mode yet.', [
    'Option A — OKX Convert/Trade API (custodial treasury):',
    '  POST /api/v5/asset/convert/trade  (convert received token -> USDT)',
    '  Auth headers: OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-TIMESTAMP / OK-ACCESS-PASSPHRASE',
    '  Env placeholders: OKX_API_KEY, OKX_API_SECRET, OKX_API_PASSPHRASE',
    '  (Verify exact endpoint + params in current OKX API docs before wiring.)',
    'Option B — Onchain OS skill (self-custody): swap via OKX DEX aggregator on',
    '  X Layer, then transfer to the treasury address. Exact skill name = open',
    '  question for the rails scout (see STATUS.md).',
  ]);
}

/* ============================================================= mock rail */

// state/mock-chain.json: { checks: { [invoiceId]: n } }
function loadMockChain() {
  try {
    return JSON.parse(fs.readFileSync(PATHS.mockChainFile, 'utf8'));
  } catch {
    return { checks: {} };
  }
}

function saveMockChain(mock) {
  fs.mkdirSync(path.dirname(PATHS.mockChainFile), { recursive: true });
  fs.writeFileSync(PATHS.mockChainFile, JSON.stringify(mock, null, 2) + '\n', 'utf8');
}

/**
 * Scenario logic. `payOn` = the check number on which money first arrives.
 *   full    : 100% of the remaining balance on check #payOn
 *   partial : 60% of the total on check #payOn, the remainder on #payOn+2
 *   over    : 110% of the total on check #payOn (tests overpayment flagging)
 */
function mockCheckForTransfers(invoice, opts) {
  const scenario = normalizeScenario(opts.scenario || MOCK.scenario);
  const payOn = Number(opts.payOn || MOCK.payOnCheck);

  const mock = loadMockChain();
  const checkNumber = (mock.checks[invoice.id] || 0) + 1;
  mock.checks[invoice.id] = checkNumber;
  saveMockChain(mock);

  const transfers = [];
  const decimals = CHAIN.tokens[invoice.token]?.decimals ?? 6;
  const totalUnits = toBaseUnits(invoice.amount, decimals);
  const paidUnits = toBaseUnits(invoice.amountPaid || 0, decimals);
  const remainingUnits = totalUnits - paidUnits;

  let amountUnits = 0;
  if (remainingUnits > 0) {
    if (scenario === 'full' && checkNumber === payOn) {
      amountUnits = remainingUnits;
    } else if (scenario === 'over' && checkNumber === payOn) {
      amountUnits = Math.round(totalUnits * 1.1) - paidUnits;
    } else if (scenario === 'partial') {
      if (checkNumber === payOn) amountUnits = Math.round(totalUnits * 0.6) - paidUnits;
      else if (checkNumber === payOn + 2) amountUnits = remainingUnits;
    }
  }

  if (amountUnits > 0) {
    transfers.push({
      txHash: randomTxHash(),
      from: '0x' + sha256hex(`payer:${invoice.client}`).slice(0, 40),
      to: invoice.address,
      token: invoice.token,
      amount: fromBaseUnits(amountUnits, decimals),
      reference: invoice.reference, // mock convenience; see matching notes in header
      blockNumber: 21_000_000 + checkNumber * 7,
      at: now().toISOString(),
    });
  }

  return { checkNumber, transfers };
}

/* ============================================================= real rail */

/**
 * REAL-MODE STUB.
 * Preferred: replace the body with Onchain OS skill calls (see file header).
 * Included below: a working-shape JSON-RPC fallback (eth_getLogs) — UNTESTED,
 * gated on config so it can never run against placeholder values.
 */
async function realCheckForTransfers(invoice, _opts) {
  assertRealChainConfig(invoice.token);

  const token = CHAIN.tokens[invoice.token];
  const cursor = invoice.watch?.lastBlock; // caller persists invoice.watch

  const latestHex = await rpc('eth_blockNumber', []);
  const latest = Number.parseInt(latestHex, 16);
  const fromBlock = cursor ? cursor + 1 : Math.max(0, latest - 5_000);

  const logs = await rpc('eth_getLogs', [{
    fromBlock: '0x' + fromBlock.toString(16),
    toBlock: '0x' + latest.toString(16),
    address: token.address,
    topics: [
      TRANSFER_TOPIC,
      null, // from: anyone
      '0x' + invoice.address.slice(2).toLowerCase().padStart(64, '0'), // to: us
    ],
  }]);

  const transfers = (logs || []).map((log) => ({
    txHash: log.transactionHash,
    from: '0x' + log.topics[1].slice(26),
    to: invoice.address,
    token: invoice.token,
    amount: Number(BigInt(log.data)) / 10 ** token.decimals,
    reference: null, // no memo on ERC-20 — see matching strategies in header
    blockNumber: Number.parseInt(log.blockNumber, 16),
    at: now().toISOString(),
  }));

  return { checkNumber: null, transfers, scannedTo: latest };
}

function assertRealChainConfig(tokenSymbol) {
  const token = CHAIN.tokens[tokenSymbol];
  const problems = [];
  if (!token) problems.push(`Unknown token "${tokenSymbol}".`);
  if (token && /TODO/i.test(token.address)) {
    problems.push(`XLAYER_${tokenSymbol}_ADDRESS is a placeholder — verify the contract on ${CHAIN.explorer}.`);
  }
  if (!CHAIN.rpcUrl) problems.push('XLAYER_RPC_URL is not set.');
  if (problems.length) {
    throw new NotConfiguredError('Real chain watching is not configured yet.', [
      ...problems,
      'Preferred path: wire OKX Onchain OS skills here (npx skills add okx/onchainos-skills).',
      'Fallback path: set the env vars above and the built-in eth_getLogs poller will run.',
      'Full wiring checklist: STATUS.md.',
    ]);
  }
}

async function rpc(method, params) {
  const res = await fetch(CHAIN.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`X Layer RPC HTTP ${res.status} from ${CHAIN.rpcUrl}`);
  const body = await res.json();
  if (body.error) throw new Error(`X Layer RPC error: ${body.error.message || JSON.stringify(body.error)}`);
  return body.result;
}
