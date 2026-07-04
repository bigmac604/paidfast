# PaidFast — STATUS

_Last updated: 2026-07-02 · v0 (mock rails verified end-to-end)_

## TL;DR

The whole product loop **runs today with zero credentials**: invoice → chain-watch →
polite escalating reminders → receipt to both parties → sweep step. Everything
external (chain, email, LLM copy) sits behind three adapters with `OKX_MODE=mock`
defaults; real mode is a set of documented stubs that fail loudly with wiring
instructions instead of guessing.

```
verified:  npm test          → 38/38 passing (payment matching + reminder scheduling + x402 gate)
verified:  npm run demo      → full lifecycle in ~7s, artifacts in out/
verified:  npm run x402-demo → x402 handshake: 402 challenge → mock payment → 201 + receipt
```

## How to run

```bash
# from paidfast/  (Node >= 18.17, no npm install needed — zero dependencies)
npm run demo      # the 90-second story, scripted & narrated (safe: uses state/demo-*.json)
npm test          # node:test unit suites

node src/index.js create --client "Acme" --amount 500 --for "landing page" --due 7d --email billing@acme.com
node src/index.js watch                     # one pass over open invoices
node src/index.js watch --loop --interval 10
node src/index.js remind                    # run on a schedule (cron / Task Scheduler)
node src/index.js list [--json]
```

Mock scenario knobs (flags beat env vars):

```powershell
# PowerShell
node src/index.js watch --scenario partial --pay-on 1   # 60% arrives, then the rest 2 checks later
node src/index.js watch --scenario over                 # 110% arrives → PAID + overpaid flag
$env:PAIDFAST_NOW='2026-07-12T09:00:00Z'; node src/index.js remind   # time-travel the collections loop
```

```bash
# bash
PAIDFAST_MOCK_SCENARIO=partial node src/index.js watch
PAIDFAST_NOW=2026-07-12T09:00:00Z node src/index.js remind
```

Useful env vars: `OKX_MODE` (mock|real), `X402_MODE` (off|mock|real — pay-per-call gate,
see the x402 section), `PAIDFAST_OWNER_NAME` / `PAIDFAST_OWNER_EMAIL`
(who invoices come from), `PAIDFAST_NOW` (ISO; time-travel), `PAIDFAST_STATE_FILE`.

## What works (verified in mock)

| Piece | Status | Evidence |
|---|---|---|
| Invoice engine (`create`) | ✅ | record in `state/invoices.json`, unique `PF-…` reference, unique deposit address, polished self-contained HTML in `out/invoices/` (print → Save as PDF), invoice email via adapter |
| Chain watcher (`watch`) | ✅ mock | single-pass + `--loop`; simulated transfer arrives on check #N (default 3) |
| Exact payment | ✅ | → `PAID`, receipt + sweep fire automatically |
| Partial payment | ✅ | → `PARTIAL`, remaining computed in integer base units; reminders chase the remainder; later transfer completes it |
| Overpayment | ✅ | → `PAID` + `overpaid` flag; excess amount surfaced on receipt + owner email |
| Collections loop (`remind`) | ✅ | gentle at due−2d → firmer at due → escalation at due+3d; distinct, genuinely-written copy per stage; per-stage history = zero double-sends; offline-for-a-week sends only the most advanced stage (unit-tested) |
| Receipts | ✅ | HTML receipt in `out/receipts/` + emails to client and owner |
| Sweep step | ✅ mock | logged + recorded on the invoice (`invoice.sweep`) |
| Emails | ✅ mock | RFC-822-style `.eml` files in `out/emails/` — open in any mail client |
| x402 pay-per-call gate | ✅ mock | `POST /api/invoices` behind HTTP 402 handshake when `X402_MODE=mock`; off by default; `npm run x402-demo` round trip |
| Unit tests | ✅ | `test/matcher.test.js` (12) + `test/reminders.test.js` (13) + `test/x402.test.js` (13) via `node --test` |

## What's mocked vs real

| Adapter | Mock behavior (default) | Real mode today |
|---|---|---|
| `src/adapters/chain.js` | simulated transfers w/ full/partial/over scenarios; deterministic per-invoice deposit addresses; check counters in `state/mock-chain.json` | **stub** — throws `NotConfiguredError` listing exactly what to set; includes an implemented-but-**untested** `eth_getLogs` poller that activates once env vars are real |
| `src/adapters/email.js` | writes `.eml` files to `out/emails/` | **stub** — documents Resend (`RESEND_API_KEY`) and SMTP/nodemailer options |
| `src/adapters/llm.js` | curated canned templates (they're good — see any reminder in `out/emails/`) | **stub** — documents the Claude call (`@anthropic-ai/sdk`, model `claude-opus-4-8`, structured outputs for `{subject, body}`); deliberately falls back to templates so a down LLM can never block a reminder |

## x402 payment layer (pay-per-call service fee)

OKX.AI lists PaidFast as an **A2MCP** service: `POST /api/invoices` at **1 USDT per
call**, settled instantly per request via the x402 standard (HTTP 402 handshake).

**Two distinct payment layers — do not conflate them:**

| Layer | Who pays | What for | Where in code |
|---|---|---|---|
| **x402 service fee** | the **freelancer** (the agent calling our API) | 1 USDT per invoice *issued* | `src/x402/gate.js` + `src/adapters/facilitator.js` |
| **the invoice itself** | the freelancer's **client** | the invoiced amount, on X Layer | `src/adapters/chain.js` + `src/matcher.js` (never x402) |

### Envs

| Env | Values | Meaning |
|---|---|---|
| `X402_MODE` | `off` (default) \| `mock` \| `real` | `off` = gate transparent, every route behaves exactly as before x402 existed. `mock` = full handshake against an in-process facilitator, zero credentials. `real` = OKX facilitator over HTTPS. |
| `X402_PAY_TO` | wallet address | receives the 1 USDT fee; loud placeholder `0xREPLACE_OWNER_WALLET` by default |
| `OKX_X402_API_KEY` / `OKX_X402_SECRET` / `OKX_X402_PASSPHRASE` | strings | real-mode facilitator credentials; missing any → **fail fast** (`NotConfiguredError`, surfaced as HTTP 501) |
| `OKX_X402_BASE_URL` | url | facilitator base, default `https://web3.okx.com` |

### Flow (x402 v1, scheme `exact`, network `eip155:196` = X Layer mainnet)

```
client → POST /api/invoices                              (no payment header)
server → 402 · PAYMENT-REQUIRED: base64(JSON full challenge)
           {x402Version:1, resource:"/api/invoices",
            accepts:[{x402Version:1, scheme:"exact", network:"eip155:196",
              maxAmountRequired:"1000000" (1 USDT × 10^6), resource:"/api/invoices",
              payTo:$X402_PAY_TO, asset:0x779d…3736 (USDT), extra:{name:"USDT",decimals:6}}]}
           (the header MUST decode to the full challenge with accepts[] — a bare
            PaymentRequirements object fails validation as "accepts is empty")
           body: {ok:false, x402Version, resource, error, accepts:[requirements]}
client → POST /api/invoices · PAYMENT-SIGNATURE: base64(JSON PaymentPayload)
           (v2 replay header, checked first; legacy X-PAYMENT still accepted)
server → facilitator.verify() → facilitator.settle()
           ok   → 201 (invoice created) + PAYMENT-RESPONSE: base64(JSON receipt)
           fail → 402 with an `error` field (challenge re-attached)
```

Only invoice **creation** is gated. Dashboard, invoice/receipt views, `GET /api/*`,
`/api/watch`, `/api/remind` and `/api/health` stay free.

Try it: `npm run x402-demo` (in-process server, `X402_MODE=mock`, own
`state/x402-demo-*.json` files — never touches real invoices).

### Confirmed vs assumed

**Confirmed / verified in mock:**
- Full handshake round trip (402 → pay → 201 + receipt) via `npm run x402-demo`.
- `X402_MODE=off` (default) is a byte-identical passthrough — verified over HTTP.
- Mock verify enforces base64-JSON payload, scheme + network match, and declared
  amount ≥ 1,000,000 base units (BigInt compare); mock settle returns a
  deterministic tx hash (`0x` + sha256 of the payload).
- X Layer USDT: `0x779ded0c9e1022225f8e0630b35a9b54be713736`, 6 decimals, chain 196.

**Assumed — verify before flipping `X402_MODE=real`:**
- Facilitator endpoints `POST https://web3.okx.com/api/v6/pay/x402/verify` and
  `/settle` with body `{paymentPayload, paymentRequirements}`.
- OKX v5-style HMAC auth header names (`OK-ACCESS-KEY`, `OK-ACCESS-SIGN` =
  base64(hmacSHA256(timestamp+method+requestPath+body, secret)),
  `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`) — marked ASSUMED in
  `src/adapters/facilitator.js`, pending confirmation against current OKX docs.
- Facilitator response shapes (`{isValid,…}` / `{success, transaction,…}`).
- Alternative to the hand-rolled client: OKX's official SDKs
  (`@okxweb3/x402-core`, `x402-express` middleware, `@okxweb3/x402-evm`) wrap this
  handshake — not used here because this repo is deliberately zero-dependency.

## Real-mode wiring steps

### 1. Chain watching (`src/adapters/chain.js`)

Preferred rail — **OKX Onchain OS skills**:

1. `npx skills add okx/onchainos-skills`
2. Replace the body of `realCheckForTransfers()` with the skill call that watches
   an address / queries token transfers on X Layer.
3. Decide the payment-matching strategy (see open questions below).

Fallback rail — **direct X Layer RPC** (already implemented in the adapter, untested):

```
XLAYER_RPC_URL=https://rpc.xlayer.tech        # verify; alt https://xlayerrpc.okx.com
XLAYER_CHAIN_ID=196                            # mainnet (195 testnet) — verify
XLAYER_USDT_ADDRESS=0x…                        # verify on https://www.oklink.com/xlayer
XLAYER_USDC_ADDRESS=0x…                        # verify on OKLink
PAIDFAST_RECEIVE_ADDRESS=0x…                   # your wallet (or implement xpub derivation)
```

It polls `eth_getLogs` for ERC-20 `Transfer` events (`topic0 = 0xddf252ad…`,
`topic2 = our address`) and decodes amounts against token decimals. The guard
refuses to run while any value is a placeholder.

### 2. Email (`src/adapters/email.js`)

Simplest: create a Resend account, set `RESEND_API_KEY`, implement the documented
`POST https://api.resend.com/emails` call (attach the invoice/receipt HTML files
that mock mode only references). SMTP/nodemailer alternative documented in-file.

### 3. Reminder copy (`src/adapters/llm.js`)

`npm i @anthropic-ai/sdk`, set `ANTHROPIC_API_KEY`, implement the documented
`client.messages.create` call (model `claude-opus-4-8`, structured outputs
guaranteeing `{subject, body}`). Keep the template fallback — reminders must
send even when the LLM is down.

### 4. Sweep (`src/adapters/chain.js` → `sweepToStables`)

Two documented options, pick one with the rails scout:
- **OKX Convert/Trade API** (custodial treasury): `POST /api/v5/asset/convert/trade`
  with `OK-ACCESS-*` auth headers (`OKX_API_KEY/SECRET/PASSPHRASE`) — verify the
  exact endpoint/params in current OKX docs.
- **Onchain OS DEX swap** (self-custody): swap on X Layer via the OKX DEX
  aggregator skill, then transfer to treasury.

## Open X Layer questions (for the rails scout / human)

1. **Onchain OS skill surface** — after `npx skills add okx/onchainos-skills`,
   what are the exact skill names + invocation API for (a) watching an address
   for ERC-20 transfers on X Layer, (b) DEX swaps? Push subscription or poll?
2. **Payment matching strategy** — ERC-20 transfers carry no memo, so the `PF-…`
   reference cannot ride on-chain. Decide:
   - **A. unique deposit address per invoice** (what the mock simulates) — needs
     HD derivation (xpub) + periodic sweep consolidation; cleanest UX;
   - **B. amount fingerprinting** (bill 500.013927 instead of 500.00) at one
     shared address — zero wallet infra, slightly odd amounts;
   - **C. known-sender matching** (client registers their wallet) — most fragile.
3. **Verify chain params** — chainId 196 (mainnet) / 195 (testnet), RPC URLs, and
   USDT/USDC contract addresses on OKLink. Deliberately left as failing
   placeholders so nothing can silently run against guessed values.
4. **Sweep rail** — custodial (OKX Convert API; which API-key permissions?) vs
   self-custody (DEX swap skill)? Fees on X Layer for either path?
5. **Marketplace (Phase 5)** — ASP listing requirements + how per-invoice fees
   ($0.50–1 or 0.5–1%) get collected.

## Architecture

```
src/index.js            CLI (create · watch · remind · list) — node:util parseArgs
src/config.js           env, paths, chain params, mode; PAIDFAST_NOW time-travel
src/store.js            JSON state (state/invoices.json), atomic-ish writes
src/matcher.js          PURE: transfer→invoice matching + exact/partial/over math (base units)
src/reminders.js        PURE: stage scheduling (due−2d / due / due+3d), no-double-send
src/facts.js            invoice → human strings (payment block, due phrases)
src/templates.js        self-contained HTML: invoice + receipt (inline CSS, print-friendly)
src/receipts.js         on-PAID: receipt render + both emails + sweep
src/commands/*.js       one file per CLI command
src/adapters/chain.js   X Layer watching + sweep   (mock ✅ / real: documented stub)
src/adapters/email.js   delivery                   (mock ✅ / real: documented stub)
src/adapters/llm.js     copywriting                (mock ✅ / real: documented stub)
src/x402/gate.js        x402 HTTP 402 handshake for POST /api/invoices (off|mock|real)
src/adapters/facilitator.js  x402 verify/settle    (mock ✅ / real: OKX facilitator, creds pending)
scripts/demo.js         narrated lifecycle (own state files; safe to re-run forever)
scripts/x402-demo.js    x402 handshake demo (own state files; safe to re-run forever)
test/                   node:test suites for matcher + reminders
state/                  runtime data (gitignored)   out/  generated artifacts (gitignored)
```

## Known limitations (v0, by design)

- "Plain-English ask" is CLI flags, not free-form NLP (an LLM intake layer would
  slot in front of `cmdCreate` without touching anything else).
- Mock emails reference attachments by path instead of MIME-encoding them.
- Real-mode `eth_getLogs` poller is code-reviewed but has never touched a live RPC.
- No QR code on the invoice (would need a dep or a QR implementation; step-by-step
  wallet instructions cover the gap).
- JSON store is single-user/single-process — fine for a CLI agent, not for a service.
