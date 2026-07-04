// PaidFast configuration.
// Everything external lives behind env vars so no credentials are ever baked in.
// Default mode is "mock" — the whole product runs end-to-end with zero secrets.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Project root (the paidfast/ directory). */
export const ROOT = path.resolve(__dirname, '..');

/**
 * OKX_MODE: "mock" (default) | "real"
 *  - mock: simulated chain transfers, emails written to out/emails/, canned LLM copy.
 *  - real: adapters throw NotConfiguredError with exact wiring instructions
 *          (see src/adapters/*.js and STATUS.md). No credentials exist yet.
 */
export const MODE = (process.env.OKX_MODE || 'mock').toLowerCase() === 'real' ? 'real' : 'mock';

export const PATHS = {
  stateFile: process.env.PAIDFAST_STATE_FILE || path.join(ROOT, 'state', 'invoices.json'),
  mockChainFile: process.env.PAIDFAST_MOCK_CHAIN_FILE || path.join(ROOT, 'state', 'mock-chain.json'),
  outDir: path.join(ROOT, 'out'),
  invoicesDir: path.join(ROOT, 'out', 'invoices'),
  emailsDir: path.join(ROOT, 'out', 'emails'),
  receiptsDir: path.join(ROOT, 'out', 'receipts'),
};

/**
 * X Layer network parameters.
 * PLACEHOLDERS — verify every value on https://www.oklink.com/xlayer before real mode.
 * (Chain id + RPC below match OKX's published X Layer parameters — chainId 196
 * mainnet / 1952 testnet, RPC rpc.xlayer.tech. Known-good token contract
 * addresses are listed in STATUS.md, but the env defaults here are left
 * intentionally invalid so real mode can never run against unreviewed values.)
 */
export const CHAIN = {
  name: 'X Layer',
  network: 'X Layer (OKB L2)',
  chainId: Number(process.env.XLAYER_CHAIN_ID || 196), // mainnet (testnet 1952) — re-verify before real mode
  rpcUrl: process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech', // OKX-published public RPC; alt: https://xlayerrpc.okx.com
  explorer: 'https://www.oklink.com/xlayer',
  tokens: {
    USDT: {
      symbol: 'USDT',
      decimals: Number(process.env.XLAYER_USDT_DECIMALS || 6),
      // Intentionally not a real address. Set XLAYER_USDT_ADDRESS after verifying on OKLink.
      address: process.env.XLAYER_USDT_ADDRESS || '0xTODO_VERIFY_USDT_CONTRACT_ON_OKLINK',
    },
    USDC: {
      symbol: 'USDC',
      decimals: Number(process.env.XLAYER_USDC_DECIMALS || 6),
      address: process.env.XLAYER_USDC_ADDRESS || '0xTODO_VERIFY_USDC_CONTRACT_ON_OKLINK',
    },
  },
  // Real mode: either a fixed receiving address (with reference-based matching),
  // or an xpub for unique-address-per-invoice derivation (preferred; see chain.js).
  receiveAddress: process.env.PAIDFAST_RECEIVE_ADDRESS || '',
};

/** The freelancer using PaidFast (appears on invoices, receipts, reminder sign-offs). */
export const OWNER = {
  name: process.env.PAIDFAST_OWNER_NAME || 'Freelance Studio',
  email: process.env.PAIDFAST_OWNER_EMAIL || 'you@freelance.studio',
  fromEmail: process.env.PAIDFAST_FROM_EMAIL || 'billing@paidfast.local',
};

/** Mock chain scenario knobs (also overridable per-run via `watch` CLI flags). */
export const MOCK = {
  // On which watch pass the (first) simulated transfer arrives.
  payOnCheck: clampInt(process.env.PAIDFAST_MOCK_PAY_ON, 3, 1, 99),
  // full | partial | over  (partial: 60% on payOn, remainder two checks later)
  scenario: normalizeScenario(process.env.PAIDFAST_MOCK_SCENARIO),
};

/**
 * Current time. PAIDFAST_NOW (ISO string) lets you time-travel for demos/testing,
 * e.g. `PAIDFAST_NOW=2026-07-12T09:00:00Z node src/index.js remind` to see the
 * escalation email for an invoice due Jul 9.
 */
export function now() {
  const override = process.env.PAIDFAST_NOW;
  if (override) {
    const d = new Date(override);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function normalizeScenario(s) {
  const v = String(s || 'full').toLowerCase();
  return ['full', 'partial', 'over'].includes(v) ? v : 'full';
}

function clampInt(raw, def, min, max) {
  const n = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
