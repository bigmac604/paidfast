# PaidFast

**Crypto invoicing & payment-collection agent for freelancers.** "Invoice my client $500" → the agent generates the invoice, watches the chain for payment, chases politely if unpaid, sends a receipt, and can sweep to stables.

## Target: Business Potential

The customer is a normal person with a real cash-flow problem, not a trader. Matches OKX.AI's own "one person, one company" pitch. Huge TAM — global freelancers, especially markets like Nigeria where getting paid across borders is genuinely painful. Least crowded lane: most entrants will build trading agents.

## Revenue model

- Per-invoice fee (flat $0.50–1 or 0.5–1%)
- Free first 3 invoices (activation funnel)

## How it works

```
"Invoice Acme $500 for the landing page, due in 7 days"
        │
        ▼
┌─ Invoice engine ────────┐
│ PDF invoice + unique    │
│ payment address/ref     │
│ (X Layer, USDT/USDC)    │
└──────────┬──────────────┘
           ▼
┌─ Chain watcher ─────────┐   Onchain OS skills:
│ monitor address for     │   EVM (X Layer) payment
│ payment / partial pay   │   detection
└──────────┬──────────────┘
           ▼
┌─ Collections loop ──────┐
│ unpaid @ due-2d: gentle │
│ reminder to client      │
│ paid: receipt to both,  │
│ optional sweep→stables  │
└─────────────────────────┘
```

## Stack

- Node.js / TypeScript *(v0 shipped: plain Node.js ESM, zero dependencies)*
- Onchain OS skills (`npx skills add okx/onchainos-skills`) for X Layer payment watching *(v0: mocked behind `src/adapters/chain.js`; real wiring documented there + STATUS.md)*
- PDF invoice generation (HTML template → PDF) *(v0: self-contained print-to-PDF-friendly HTML, no headless browser)*
- Email delivery (invoice + reminders + receipts) *(v0: mock writes .eml files to `out/emails/`; Resend/SMTP stub in `src/adapters/email.js`)*
- Claude for the polite-but-effective reminder copy *(v0: curated canned templates; Claude API stub in `src/adapters/llm.js`)*
- State store: SQLite (invoices, statuses, reminder schedule) *(v0: JSON file at `state/invoices.json` per the minimal-deps constraint)*

## Run it

```bash
npm run demo     # scripted 90s-story: create → watch ×2 → reminder → payment → receipt + sweep
npm test         # unit tests: payment matching (exact/partial/over) + reminder scheduling

node src/index.js create --client "Acme" --amount 500 --for "landing page" --due 7d --email billing@acme.com
node src/index.js watch [--loop] [--scenario partial|over]
node src/index.js remind
node src/index.js list
```

Everything runs end-to-end with zero credentials (`OKX_MODE=mock`, the default). See `STATUS.md` for what's real vs mocked and the exact real-mode wiring steps.

## Build plan

- [x] Phase 1 — Rails: detect an incoming USDT/USDC transfer on X Layer to a watched address
      *(done in mock: simulated transfers incl. partial/overpayment scenarios, verified end-to-end. Real rail NOT wired: Onchain OS usage + an implemented-but-untested `eth_getLogs` RPC fallback are documented stubs in `src/adapters/chain.js`; open questions in STATUS.md)*
- [x] Phase 2 — Invoice engine: ask → invoice with payment details + unique reference
      *(CLI flags rather than free-form English; outputs polished self-contained HTML — print → Save as PDF — plus unique per-invoice deposit address + `PF-…` reference)*
- [x] Phase 3 — Collections loop: due-date scheduler, reminder emails, receipt on payment
      *(gentle at due−2d, firmer at due, escalation at due+3d; per-stage history prevents double-sends; receipts emailed to both parties; unit-tested)*
- [x] Phase 4 — Sweep: optional convert-to-stables step after payment lands
      *(step runs and is logged in mock; real OKX convert/trade call is a documented stub in `src/adapters/chain.js`)*
- [ ] Phase 5 — Marketplace: ASP listing, per-invoice pricing, free-tier funnel
- [ ] Phase 6 — Demo: 90s video — voice/text ask → invoice out → payment lands → receipt, hands-free
      *(console backbone ready: `npm run demo` narrates the exact lifecycle; video itself not recorded)*
- [ ] Submit Google form (after listing, before Jul 17 00:00 UTC)
- [ ] Post demo on X with #okxai

## Demo script (≤90s)

1. (0–20s) The pain: "You did the work. Now you get to spend a week asking to be paid."
2. (20–60s) "Invoice Acme $500, due Friday" → PDF lands in client inbox → (cut) payment hits X Layer → receipt auto-sent
3. (60–90s) The unpaid path: the agent's polite day-5 reminder. "You do the work. PaidFast does the chasing."
