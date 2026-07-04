// Self-contained HTML documents: the invoice and the receipt.
// Inline CSS only, no external assets, print-to-PDF friendly (Ctrl+P → Save as
// PDF gives a clean A4 page — no puppeteer needed).

import { OWNER, CHAIN } from './config.js';
import { esc, formatAmount, humanDate, shortHash } from './util.js';
import { isRealAddress } from './facts.js';

const BOLT_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" fill="#ffffff"/></svg>`;

const BASE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #eef2f6; color: #0f172a; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { max-width: 780px; margin: 0 auto; padding: 36px 20px 60px; }
  .card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 18px;
    overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, .06);
  }
  .mono { font-family: ui-monospace, "Cascadia Code", Consolas, Menlo, monospace; }
  .muted { color: #64748b; }
  .chip {
    display: inline-block; padding: 5px 12px; border-radius: 999px;
    font-size: 11.5px; font-weight: 700; letter-spacing: .08em;
  }
  .chip-amber { background: #fef3c7; color: #92400e; }
  .chip-blue  { background: #e0f2fe; color: #075985; }
  .chip-green { background: #d1fae5; color: #065f46; }
  header.bar {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 16px; padding: 28px 34px; background: #0f172a; color: #fff;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .mark {
    width: 40px; height: 40px; border-radius: 12px; background: #0d9488;
    display: flex; align-items: center; justify-content: center; flex: none;
  }
  .brand b { font-size: 19px; letter-spacing: .02em; }
  .brand .sub { font-size: 12px; color: #94a3b8; margin-top: 1px; }
  .head-right { text-align: right; }
  .head-right .no { font-size: 11px; letter-spacing: .14em; color: #94a3b8; }
  .head-right .id { font-size: 16px; font-weight: 700; margin: 2px 0 8px; }
  section { padding: 26px 34px; }
  section + section { border-top: 1px solid #eef2f6; }
  .grid { display: flex; flex-wrap: wrap; gap: 18px 28px; }
  .grid > div { flex: 1 1 150px; min-width: 150px; }
  .label {
    font-size: 10.5px; font-weight: 700; letter-spacing: .12em;
    text-transform: uppercase; color: #94a3b8; margin-bottom: 4px;
  }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th {
    text-align: left; font-size: 10.5px; letter-spacing: .12em; color: #94a3b8;
    text-transform: uppercase; padding: 0 0 10px; border-bottom: 1px solid #e2e8f0;
  }
  table.items th:last-child, table.items td:last-child { text-align: right; }
  table.items td { padding: 14px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .total-row td { border-bottom: none; padding-top: 18px; }
  .total-label { font-weight: 600; color: #334155; }
  .total-amount { font-size: 26px; font-weight: 800; letter-spacing: -.01em; white-space: nowrap; }
  .total-amount small { font-size: 14px; font-weight: 700; color: #0d9488; }
  .paybox {
    background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 14px;
    padding: 22px 24px; margin-top: 4px;
  }
  .paybox h3 { font-size: 14px; margin-bottom: 14px; color: #134e4a; }
  .payrow { display: flex; gap: 14px; padding: 6px 0; font-size: 13.5px; align-items: baseline; }
  .payrow .k { flex: 0 0 92px; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #0f766e; }
  .payrow .v { word-break: break-all; }
  .refchip {
    display: inline-block; background: #134e4a; color: #99f6e4; border-radius: 8px;
    padding: 3px 10px; font-weight: 700; letter-spacing: .06em;
  }
  .warn {
    margin-top: 14px; padding: 10px 14px; border-radius: 10px; font-size: 12.5px;
    background: #fffbeb; border: 1px solid #fde68a; color: #92400e;
  }
  ol.steps { margin: 14px 0 0 18px; font-size: 13px; color: #475569; }
  ol.steps li { margin: 4px 0; }
  footer {
    padding: 18px 34px 26px; font-size: 12px; color: #94a3b8;
    display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  }
  .postscript { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 18px; }
  @media print {
    body { background: #fff; }
    .page { padding: 0; max-width: none; }
    .card { border: none; box-shadow: none; border-radius: 0; }
    .postscript { display: none; }
  }
  @page { margin: 14mm; }
`;

function statusChip(status) {
  if (status === 'PAID') return `<span class="chip chip-green">PAID</span>`;
  if (status === 'PARTIAL') return `<span class="chip chip-blue">PARTIALLY PAID</span>`;
  return `<span class="chip chip-amber">AWAITING PAYMENT</span>`;
}

function headerBar(invoice, docLabel) {
  return `<header class="bar">
    <div class="brand">
      <div class="mark">${BOLT_SVG}</div>
      <div><b>PaidFast</b><div class="sub">${docLabel} · ${esc(CHAIN.network)}</div></div>
    </div>
    <div class="head-right">
      <div class="no">${docLabel.toUpperCase()} №</div>
      <div class="id">${esc(invoice.id)}</div>
      ${statusChip(invoice.status)}
    </div>
  </header>`;
}

/* ---------------------------------------------------------------- invoice */

export function invoiceHtml(invoice) {
  const token = CHAIN.tokens[invoice.token] || {};
  const owed = invoice.status === 'PARTIAL' ? invoice.remaining : invoice.amount;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${esc(invoice.id)} · PaidFast</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="page">
  <div class="card">
    ${headerBar(invoice, 'Invoice')}

    <section>
      <div class="grid">
        <div><div class="label">From</div><div><b>${esc(OWNER.name)}</b></div><div class="muted" style="font-size:13px">${esc(OWNER.email)}</div></div>
        <div><div class="label">Bill to</div><div><b>${esc(invoice.client)}</b></div><div class="muted" style="font-size:13px">${esc(invoice.clientEmail || '—')}</div></div>
        <div><div class="label">Issued</div><div>${humanDate(invoice.createdAt)}</div></div>
        <div><div class="label">Due</div><div><b>${humanDate(invoice.dueAt)}</b></div></div>
      </div>
    </section>

    <section>
      <table class="items">
        <thead><tr><th>Description</th><th>Amount</th></tr></thead>
        <tbody>
          <tr>
            <td><b>${esc(capitalize(invoice.description))}</b><br>
                <span class="muted" style="font-size:12.5px">Payment reference <span class="mono">${esc(invoice.reference)}</span></span></td>
            <td class="mono">${formatAmount(invoice.amount)} ${esc(invoice.token)}</td>
          </tr>
          ${invoice.status === 'PARTIAL' ? `
          <tr>
            <td class="muted">Received so far — thank you</td>
            <td class="mono muted">− ${formatAmount(invoice.amountPaid)} ${esc(invoice.token)}</td>
          </tr>` : ''}
          <tr class="total-row">
            <td class="total-label">Total due · ${esc(invoice.token)} on ${esc(CHAIN.name)}</td>
            <td class="total-amount">${formatAmount(owed)} <small>${esc(invoice.token)}</small></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <div class="paybox">
        <h3>How to pay — takes about a minute</h3>
        <div class="payrow"><div class="k">Network</div><div class="v"><b>${esc(CHAIN.network)}</b> · chainId ${CHAIN.chainId}</div></div>
        <div class="payrow"><div class="k">Token</div><div class="v"><b>${esc(invoice.token)}</b>${isRealAddress(token.address) ? ` <span class="muted mono" style="font-size:12px">${esc(token.address)}</span>` : ''}</div></div>
        <div class="payrow"><div class="k">Amount</div><div class="v"><b>${formatAmount(owed)} ${esc(invoice.token)}</b> — exact amount, please</div></div>
        <div class="payrow"><div class="k">Address</div><div class="v mono"><b>${esc(invoice.address)}</b><br><span class="muted" style="font-size:12px">unique to this invoice — this is how your payment is recognised</span></div></div>
        <div class="payrow"><div class="k">Reference</div><div class="v"><span class="refchip mono">${esc(invoice.reference)}</span> <span class="muted" style="font-size:12px">keep for your records</span></div></div>
        <div class="warn">Send ${esc(invoice.token)} on the <b>${esc(CHAIN.name)}</b> network only. Funds sent on other networks (Ethereum, Tron, BSC, …) cannot be recovered automatically.</div>
        <ol class="steps">
          <li>Open OKX (or any wallet holding ${esc(invoice.token)}) and choose <b>Send / Withdraw</b> via the <b>${esc(CHAIN.name)}</b> network.</li>
          <li>Paste the address above and send the exact amount.</li>
          <li>Done — your receipt is emailed automatically, usually within a minute.</li>
        </ol>
      </div>
    </section>

    <footer>
      <div>Generated by <b>PaidFast</b> · invoice ${esc(invoice.id)} · ref ${esc(invoice.reference)}</div>
      <div>Questions? Just reply to the email this invoice arrived with.</div>
    </footer>
  </div>
  <p class="postscript">Tip: use your browser's Print → “Save as PDF” for a paper copy.</p>
</div>
</body>
</html>
`;
}

/* ---------------------------------------------------------------- receipt */

export function receiptHtml(invoice) {
  const payments = invoice.payments || [];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(invoice.id)} · PaidFast</title>
<style>${BASE_CSS}
  .paid-hero {
    text-align: center; padding: 40px 34px 34px;
    background: linear-gradient(180deg, #ecfdf5 0%, #ffffff 100%);
  }
  .paid-badge {
    width: 64px; height: 64px; border-radius: 50%; background: #10b981; color: #fff;
    font-size: 34px; line-height: 64px; margin: 0 auto 14px; font-weight: 800;
  }
  .paid-hero h1 { font-size: 22px; letter-spacing: -.01em; }
  .paid-hero .big { font-size: 34px; font-weight: 800; margin-top: 6px; }
  .paid-hero .big small { font-size: 16px; color: #0d9488; font-weight: 700; }
  table.detail { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  table.detail td { padding: 9px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  table.detail td.k { width: 170px; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #94a3b8; }
  .overbox {
    margin-top: 16px; padding: 12px 16px; border-radius: 10px; font-size: 13px;
    background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412;
  }
</style>
</head>
<body>
<div class="page">
  <div class="card">
    ${headerBar(invoice, 'Receipt')}

    <section class="paid-hero">
      <div class="paid-badge">✓</div>
      <h1>Payment received — thank you</h1>
      <div class="big">${formatAmount(invoice.amountPaid)} <small>${esc(invoice.token)}</small></div>
      <div class="muted" style="margin-top:4px">settled on ${esc(CHAIN.network)}</div>
    </section>

    <section>
      <table class="detail">
        <tr><td class="k">Invoice</td><td><b>${esc(invoice.id)}</b> · ref <span class="mono">${esc(invoice.reference)}</span></td></tr>
        <tr><td class="k">Billed to</td><td>${esc(invoice.client)}${invoice.clientEmail ? ` · <span class="muted">${esc(invoice.clientEmail)}</span>` : ''}</td></tr>
        <tr><td class="k">For</td><td>${esc(capitalize(invoice.description))}</td></tr>
        <tr><td class="k">Invoice total</td><td class="mono">${formatAmount(invoice.amount)} ${esc(invoice.token)}</td></tr>
        <tr><td class="k">Paid in full on</td><td><b>${humanDate(invoice.paidAt || invoice.payments?.at(-1)?.at)}</b></td></tr>
        ${payments.map((p, i) => `
        <tr>
          <td class="k">Payment ${payments.length > 1 ? i + 1 : ''}</td>
          <td class="mono">${formatAmount(p.amount)} ${esc(invoice.token)}
            · tx <a href="${CHAIN.explorer}/tx/${esc(p.txHash)}" style="color:#0d9488">${esc(shortHash(p.txHash))}</a>
            · block ${p.blockNumber ?? '—'}<br>
            <span class="muted" style="font-size:12px">from ${esc(shortHash(p.from, 10))} · ${humanDate(p.at)}</span></td>
        </tr>`).join('')}
      </table>
      ${invoice.overpaid ? `<div class="overbox"><b>Overpayment noticed:</b> ${formatAmount(invoice.overpaidBy)} ${esc(invoice.token)} above the invoice total was received. ${esc(OWNER.name)} has been flagged to credit or return the difference.</div>` : ''}
    </section>

    <footer>
      <div>Issued by <b>${esc(OWNER.name)}</b> via PaidFast</div>
      <div>This receipt confirms an on-chain payment · ${esc(CHAIN.explorer)}</div>
    </footer>
  </div>
  <p class="postscript">Keep this receipt for your records — print → “Save as PDF”.</p>
</div>
</body>
</html>
`;
}

function capitalize(s) {
  const str = String(s || '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}
