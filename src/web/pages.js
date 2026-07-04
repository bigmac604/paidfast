// PaidFast web UI — every page, server-rendered. Zero dependencies, zero CDNs:
// system font stacks, inline SVG wordmark (paper-plane-with-a-bolt), favicon as
// an inline SVG data URI. Works fully offline.
//
// Brand direction: friendly fintech SaaS for freelancers — light theme, white
// cards on a soft lavender wash, indigo→violet accent, big readable forms.
// Deliberately warm and non-intimidating: the audience sends invoices for a
// living, they don't trade.

import { MODE, CHAIN } from '../config.js';
import { esc, formatAmount, humanDate, duePhrase } from '../util.js';

/* ------------------------------------------------------------------ brand */

/** Paper-plane wordmark with a lightning bolt riding on it (inline SVG). */
export function logoSvg(size = 28, uid = 'a') {
  const g = `pfg-${uid}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PaidFast">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#4F46E5"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs>
<rect width="32" height="32" rx="9" fill="url(#${g})"/>
<path d="M27.2 5.6 6.5 14.2c-1 .4-.9 1.8.1 2.1l6.6 2 2 6.6c.3 1 1.7 1.1 2.1.1l8.6-20.7c.4-.9-.5-1.8-1.4-1.4Z" fill="#fff"/>
<path d="M17.4 10.2l-5 6.1h3l-1.5 5.9 5-6.1h-3l1.5-5.9Z" fill="url(#${g})"/>
</svg>`;
}

const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">' +
  '<stop stop-color="#4F46E5"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs>' +
  '<rect width="32" height="32" rx="9" fill="url(#g)"/>' +
  '<path d="M27.2 5.6 6.5 14.2c-1 .4-.9 1.8.1 2.1l6.6 2 2 6.6c.3 1 1.7 1.1 2.1.1l8.6-20.7c.4-.9-.5-1.8-1.4-1.4Z" fill="#fff"/>' +
  '<path d="M17.4 10.2l-5 6.1h3l-1.5 5.9 5-6.1h-3l1.5-5.9Z" fill="url(#g)"/>' +
  '</svg>';

export const FAVICON_RAW = FAVICON_SVG;
export const FAVICON_URI = 'data:image/svg+xml,' + encodeURIComponent(FAVICON_SVG);

/* -------------------------------------------------------------------- css */

const CSS = `
:root {
  --bg: #fafaff; --card: #ffffff; --ink: #221f36; --muted: #6b678c;
  --line: #e8e6f5; --line-soft: #f2f1fa;
  --indigo: #4f46e5; --indigo-deep: #4338ca; --violet: #8b5cf6;
  --indigo-soft: #eef2ff; --violet-soft: #f5f3ff;
  --grad: linear-gradient(120deg, #4f46e5 0%, #8b5cf6 100%);
  --green: #067a57; --green-soft: #d8f5e7;
  --amber: #92510a; --amber-soft: #fdeecd;
  --rose: #b1123f; --rose-soft: #ffe1e8;
  --radius: 16px;
  --shadow: 0 12px 32px rgba(78, 64, 190, .10);
  --shadow-soft: 0 4px 16px rgba(78, 64, 190, .07);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
  background: var(--bg); color: var(--ink); line-height: 1.55; font-size: 15.5px;
  -webkit-font-smoothing: antialiased;
}
.container { max-width: 1060px; margin: 0 auto; padding: 0 20px; }
a { color: var(--indigo); text-decoration: none; }
a:hover { text-decoration: underline; }
h1, h2, h3 { letter-spacing: -.02em; line-height: 1.18; }
.muted { color: var(--muted); }
.small { font-size: 12.5px; }
.mono { font-family: ui-monospace, "Cascadia Code", Consolas, Menlo, monospace; }
.break { word-break: break-all; }

/* top bar ------------------------------------------------------------- */
.topbar {
  position: sticky; top: 0; z-index: 20;
  background: rgba(255, 255, 255, .9); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.bar-inner { display: flex; align-items: center; justify-content: space-between; min-height: 62px; gap: 10px; flex-wrap: wrap; padding: 8px 20px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); font-weight: 800; font-size: 18px; letter-spacing: -.01em; }
.brand:hover { text-decoration: none; }
.brand svg { display: block; }
.nav { display: flex; align-items: center; gap: 2px 8px; font-weight: 600; font-size: 14.5px; flex-wrap: wrap; }
.nav a { color: var(--muted); padding: 7px 12px; border-radius: 10px; }
.nav a:hover { color: var(--indigo); background: var(--indigo-soft); text-decoration: none; }
.nav a.on { color: var(--indigo-deep); background: var(--indigo-soft); }
.demo-pill {
  display: inline-block; background: var(--amber-soft); color: var(--amber);
  border: 1px solid #f3ddad; font-size: 10.5px; font-weight: 800; letter-spacing: .09em;
  border-radius: 999px; padding: 4px 11px; white-space: nowrap;
}

/* buttons + chips ----------------------------------------------------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--grad); color: #fff; border: 0; border-radius: 13px;
  padding: 13px 24px; font: 700 15px/1.2 inherit; font-family: inherit; cursor: pointer;
  box-shadow: 0 6px 18px rgba(88, 70, 229, .28);
  transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
}
.btn:hover { transform: translateY(-1px); box-shadow: 0 9px 22px rgba(88, 70, 229, .34); text-decoration: none; }
.btn:disabled { opacity: .55; cursor: default; transform: none; }
.btn.ghost { background: #fff; color: var(--indigo-deep); border: 1.5px solid #cfcdf4; box-shadow: none; }
.btn.ghost:hover { background: var(--indigo-soft); }
.btn.sm { padding: 10px 16px; font-size: 13.5px; border-radius: 11px; }
.chip {
  display: inline-block; padding: 4px 12px; border-radius: 999px;
  font-size: 11px; font-weight: 800; letter-spacing: .08em; white-space: nowrap;
}
.chip-sent    { background: var(--indigo-soft); color: var(--indigo-deep); }
.chip-partial { background: var(--amber-soft);  color: var(--amber); }
.chip-paid    { background: var(--green-soft);  color: var(--green); }
.chip-overdue { background: var(--rose-soft);   color: var(--rose); }

/* cards + sections ----------------------------------------------------- */
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-soft); }
.section { padding: 46px 0 10px; }
.section h2 { font-size: 27px; }
.section-sub { color: var(--muted); margin: 8px 0 26px; max-width: 60ch; }
.page-head { padding: 34px 0 20px; }
.page-head h1 { font-size: 29px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.page-head p { color: var(--muted); margin-top: 6px; }
.crumb { display: inline-block; margin-top: 22px; font-weight: 600; font-size: 13.5px; }

/* landing --------------------------------------------------------------- */
.hero { display: grid; grid-template-columns: 1.08fr .92fr; gap: 44px; align-items: center; padding: 60px 0 34px; }
.hero-badge {
  display: inline-block; background: var(--violet-soft); color: #6d28d9;
  border: 1px solid #e4dcfb; font-size: 12px; font-weight: 700;
  border-radius: 999px; padding: 5px 13px; margin-bottom: 18px;
}
.hero h1 { font-size: clamp(30px, 4.6vw, 46px); font-weight: 800; }
.hero h1 .grad { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero .lead { margin: 18px 0 28px; font-size: 17px; color: var(--muted); max-width: 46ch; }
.hero-cta { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.hero-art { position: relative; min-height: 320px; }
.art-card { position: absolute; background: #fff; border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow); padding: 20px 22px; }
.art-invoice { width: min(330px, 92%); top: 14px; left: 2%; transform: rotate(-2deg); }
.art-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; }
.art-amount { font-size: 31px; font-weight: 800; margin: 10px 0 2px; }
.art-amount small { font-size: 15px; color: var(--indigo); font-weight: 800; }
.art-line { color: var(--muted); font-size: 13px; }
.art-addr { margin-top: 12px; padding: 9px 12px; border-radius: 10px; background: var(--indigo-soft); color: var(--indigo-deep); font-size: 12px; font-weight: 600; }
.art-toast { right: 1%; bottom: 18px; display: flex; gap: 13px; align-items: center; transform: rotate(1.6deg); }
.art-check { width: 40px; height: 40px; flex: none; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 19px; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.step { padding: 26px 24px; }
.step-n {
  width: 38px; height: 38px; border-radius: 12px; background: var(--grad); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 17px; margin-bottom: 16px;
}
.step h3 { font-size: 17px; margin-bottom: 8px; }
.step p { color: var(--muted); font-size: 14px; }
.pricing { display: grid; grid-template-columns: 1fr 1.2fr; gap: 18px; max-width: 720px; }
.price { padding: 28px 26px; }
.price-hi { border: 1.5px solid #cfcdf4; box-shadow: var(--shadow); }
.price-tier { font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--indigo); margin-bottom: 8px; }
.price-big { font-size: 36px; font-weight: 800; letter-spacing: -.02em; }
.price-big small { font-size: 15px; color: var(--muted); font-weight: 600; }
.price p { color: var(--muted); font-size: 14px; margin-top: 10px; }
.price-note { margin-top: 14px; padding: 9px 12px; border-radius: 10px; background: var(--amber-soft); color: var(--amber); font-size: 12.5px; }
.cta-band { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding: 32px 34px; margin: 46px 0 10px; background: linear-gradient(120deg, #f6f5ff, #faf7ff); border: 1.5px solid #dedbf8; }
.cta-band h2 { font-size: 23px; }

/* dashboard ------------------------------------------------------------- */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 22px; }
.stat { padding: 20px 22px; }
.stat-label { font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.stat-num { font-size: 29px; font-weight: 800; letter-spacing: -.02em; margin-top: 4px; }
.stat-num small { font-size: 14px; font-weight: 700; color: var(--indigo); }
.stat-sub { color: var(--muted); font-size: 12.5px; margin-top: 3px; }
.dash-grid { display: grid; grid-template-columns: 390px 1fr; gap: 18px; align-items: start; padding-bottom: 46px; }
.form-card { padding: 24px; }
.form-card h2 { font-size: 18px; margin-bottom: 16px; }
label.field { display: block; margin-bottom: 14px; font-weight: 600; font-size: 13.5px; }
label.field .opt { color: var(--muted); font-weight: 500; }
label.field input, label.field select {
  display: block; width: 100%; margin-top: 6px; padding: 12px 14px; font-size: 15.5px;
  font-family: inherit; color: var(--ink); background: #fff;
  border: 1.5px solid var(--line); border-radius: 12px; outline: none;
  transition: border-color .12s ease, box-shadow .12s ease;
}
label.field input:focus, label.field select:focus { border-color: var(--indigo); box-shadow: 0 0 0 3px rgba(79, 70, 229, .14); }
.hint { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; font-weight: 500; }
.row2 { display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; }
.form-msg { margin-top: 12px; font-size: 13.5px; font-weight: 600; min-height: 1.2em; }
.form-msg.ok { color: var(--green); }
.form-msg.err { color: var(--rose); }
.list-card { overflow: hidden; }
.list-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 20px 22px 12px; }
.list-head h2 { font-size: 18px; }
.inv-row {
  display: grid; grid-template-columns: minmax(0, 1.6fr) auto auto auto; gap: 6px 18px;
  align-items: center; padding: 15px 22px; color: var(--ink);
  border-top: 1px solid var(--line-soft); transition: background .1s ease;
}
.inv-row:hover { background: #f8f7ff; text-decoration: none; }
.inv-main b { display: block; font-size: 15px; }
.inv-main .sub { display: block; color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inv-amount { text-align: right; font-weight: 700; font-size: 14.5px; white-space: nowrap; }
.inv-amount .sub { display: block; color: var(--muted); font-weight: 500; font-size: 12px; }
.inv-due { color: var(--muted); font-size: 13px; white-space: nowrap; }
.empty { padding: 34px 22px; text-align: center; color: var(--muted); }

/* invoice detail --------------------------------------------------------- */
.det-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; padding: 16px 0 18px; }
.det-head h1 { font-size: 27px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.det-head .who { color: var(--muted); margin-top: 5px; }
.det-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.act-msg { margin: 0 0 16px; padding: 13px 16px; border-radius: 12px; font-size: 14px; font-weight: 600; border: 1px solid; }
.act-msg.info { background: var(--indigo-soft); border-color: #dcdafb; color: var(--indigo-deep); }
.act-msg.good { background: var(--green-soft); border-color: #bfe9d6; color: var(--green); }
.act-msg.warn { background: var(--amber-soft); border-color: #f3ddad; color: var(--amber); }
.det-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 18px; align-items: start; margin-bottom: 18px; }
.facts, .hist { padding: 22px 24px; }
.facts h2, .hist h2, .doc-head h2 { font-size: 16px; margin-bottom: 12px; }
.fact { display: flex; gap: 14px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); font-size: 14px; align-items: baseline; }
.fact:last-child { border-bottom: 0; }
.fact .k { flex: 0 0 118px; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
.fact .v { min-width: 0; }
.copy { margin-left: 8px; font: 700 11px inherit; font-family: inherit; color: var(--indigo); background: var(--indigo-soft); border: 0; border-radius: 8px; padding: 3px 9px; cursor: pointer; }
.copy:hover { background: #e2e6ff; }
.tl { list-style: none; }
.tl li { position: relative; padding: 0 0 14px 22px; font-size: 13.5px; }
.tl li::before { content: ""; position: absolute; left: 5px; top: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--indigo); }
.tl li.pay::before { background: #10b981; }
.tl li.rem::before { background: #f59e0b; }
.tl li::after { content: ""; position: absolute; left: 8.5px; top: 17px; bottom: 2px; width: 1.5px; background: var(--line); }
.tl li:last-child::after { display: none; }
.tl b { font-size: 13.5px; }
.tl .when { color: var(--muted); font-size: 12px; }
.doc-card { margin-bottom: 46px; overflow: hidden; }
.doc-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.doc-frame { display: block; width: 100%; height: 780px; border: 0; background: #eef2f6; }
.demo-note { margin-top: 14px; padding: 10px 13px; border-radius: 10px; background: var(--violet-soft); border: 1px solid #e4dcfb; color: #6d28d9; font-size: 12.5px; }

/* emails ------------------------------------------------------------------ */
.mail-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px 16px; align-items: center; padding: 15px 22px; border-top: 1px solid var(--line-soft); color: var(--ink); }
.mail-row:hover { background: #f8f7ff; text-decoration: none; }
.mail-main b { display: block; font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mail-main .sub { display: block; color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mail-date { color: var(--muted); font-size: 12.5px; white-space: nowrap; }
.mail-view { padding: 0 0 46px; }
.mail-headers { padding: 20px 24px; border-bottom: 1px solid var(--line); }
.mail-headers .fact .k { flex-basis: 76px; }
.mail-body { padding: 24px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14.5px; line-height: 1.65; font-family: inherit; }

/* footer ------------------------------------------------------------------ */
.foot { display: flex; justify-content: space-between; align-items: center; gap: 8px 20px; flex-wrap: wrap; padding: 26px 20px 40px; margin-top: 26px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
.foot-brand { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 700; }

/* responsive ---------------------------------------------------------------- */
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; padding-top: 40px; }
  .hero-art { min-height: 0; margin-top: 6px; }
  .art-card { position: static; transform: none; }
  .art-invoice { width: 100%; }
  .art-toast { margin: 14px 0 0 auto; width: fit-content; }
  .steps { grid-template-columns: 1fr; }
  .pricing { grid-template-columns: 1fr; }
  .dash-grid { grid-template-columns: 1fr; }
  .det-grid { grid-template-columns: 1fr; }
  .stats { grid-template-columns: 1fr 1fr; }
  .doc-frame { height: 640px; }
}
@media (max-width: 560px) {
  .stats { grid-template-columns: 1fr; }
  .inv-row { grid-template-columns: minmax(0, 1fr) auto; }
  .inv-due { display: none; }
  .mail-row { grid-template-columns: auto minmax(0, 1fr); }
  .mail-date { display: none; }
}
`;

/* ------------------------------------------------------------------ shell */

const DEMO_BADGE = MODE === 'mock'
  ? `<span class="demo-pill" title="Simulated X Layer rail — no real funds move">DEMO MODE</span>`
  : '';

function shell({ title, nav = '', body, script = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="PaidFast — crypto invoicing and payment collection for freelancers. Invoice in USDT, get paid without chasing.">
<title>${esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_URI}">
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
  <div class="container bar-inner" style="padding-left:0;padding-right:0">
    <a class="brand" href="/">${logoSvg(30, 'nav')}<span>PaidFast</span></a>
    <nav class="nav">
      <a href="/app" class="${nav === 'dash' ? 'on' : ''}">Dashboard</a>
      <a href="/app/emails" class="${nav === 'emails' ? 'on' : ''}">Emails</a>
      ${DEMO_BADGE}
    </nav>
  </div>
</header>
<main class="container">
${body}
</main>
<footer class="foot container">
  <span class="foot-brand">${logoSvg(18, 'foot')} PaidFast</span>
  <span>${MODE === 'mock'
    ? 'Demo build — payments are simulated on a mock X Layer rail; no real funds move.'
    : 'Live mode.'}</span>
</footer>
${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

/* --------------------------------------------------------------- helpers */

/** Dashboard-facing status: engine SENT/PARTIAL past the due date reads OVERDUE. */
export function viewStatus(inv, at) {
  if (inv.status === 'PAID') return 'PAID';
  if (new Date(inv.dueAt).getTime() < at.getTime()) return 'OVERDUE';
  return inv.status;
}

function chipFor(status, inv) {
  const cls = {
    SENT: 'chip-sent', PARTIAL: 'chip-partial', PAID: 'chip-paid', OVERDUE: 'chip-overdue',
  }[status] || 'chip-sent';
  const title = status === 'OVERDUE' && inv?.status === 'PARTIAL' ? ' title="partially paid, past due"' : '';
  return `<span class="chip ${cls}"${title}>${esc(status)}</span>`;
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || '');
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function money(n) {
  const [int, dec] = formatAmount(n).split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? `.${dec}` : '');
}

const JS_API = `
async function api(path, body) {
  const res = await fetch(path, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || (data && data.ok === false)) {
    throw new Error((data && data.error) || ('HTTP ' + res.status));
  }
  return data;
}`;

/* --------------------------------------------------------------- landing */

export function landing() {
  const body = `
<section class="hero">
  <div>
    ${MODE === 'mock' ? '<span class="hero-badge">Demo preview — simulated payments, no real funds</span>' : ''}
    <h1>You did the work.<br>Getting <span class="grad">paid</span> shouldn&rsquo;t be a second job.</h1>
    <p class="lead">PaidFast turns &ldquo;invoice my client $500&rdquo; into a polished invoice, a watched payment
    address, polite follow-ups, and an automatic receipt — paid in dollar-pegged crypto (USDT/USDC),
    settled in about a minute. No awkward chasing emails. Ever again.</p>
    <div class="hero-cta">
      <a class="btn" href="/app">Open dashboard</a>
      <a class="btn ghost" href="#how">See how it works</a>
    </div>
  </div>
  <div class="hero-art" aria-hidden="true">
    <div class="art-card art-invoice">
      <div class="art-row"><b>INV-2026-0007</b><span class="chip chip-sent">SENT</span></div>
      <div class="art-amount">500.00 <small>USDT</small></div>
      <div class="art-line">Acme Studio &middot; due Friday</div>
      <div class="art-addr">Unique payment address &middot; matched automatically</div>
    </div>
    <div class="art-card art-toast">
      <span class="art-check">&#10003;</span>
      <div><b>Payment landed</b><div class="art-line">Receipt sent to both of you</div></div>
    </div>
  </div>
</section>

<section id="how" class="section">
  <h2>How it works</h2>
  <p class="section-sub">Three steps — and none of them are &ldquo;write another awkward follow-up email&rdquo;.</p>
  <div class="steps">
    <div class="card step">
      <div class="step-n">1</div>
      <h3>Send a friendly invoice</h3>
      <p>One short form: client, amount, what it&rsquo;s for, due date. PaidFast generates a polished
      invoice with its own unique payment address and emails it to your client for you.</p>
    </div>
    <div class="card step">
      <div class="step-n">2</div>
      <h3>It watches &amp; chases for you</h3>
      <p>The agent watches the payment address around the clock. As the due date closes in, it sends
      polite, human reminders that escalate gently — heads-up, day-of, overdue — and never double-sends.</p>
    </div>
    <div class="card step">
      <div class="step-n">3</div>
      <h3>Money lands, receipts go out</h3>
      <p>The payment is matched to the invoice automatically — even partial or overpaid amounts.
      Both of you get a receipt the minute it settles, and funds sweep to stablecoins.</p>
    </div>
  </div>
</section>

<section id="pricing" class="section">
  <h2>Simple, per-invoice pricing</h2>
  <p class="section-sub">No subscription, no lock-in. You pay a small fee only when an invoice goes out.</p>
  <div class="pricing">
    <div class="card price">
      <div class="price-tier">Start free</div>
      <div class="price-big">$0</div>
      <p>Your first 3 invoices are on us — watch a payment land before you spend a cent.</p>
    </div>
    <div class="card price price-hi">
      <div class="price-tier">Then per invoice</div>
      <div class="price-big">$0.50 <small>/ invoice</small></div>
      <p>Flat fee per invoice sent. Watching, reminders, matching, receipts and sweep included.</p>
      <div class="price-note">Placeholder pricing for this demo — the final fee lands between $0.50&ndash;$1 flat or 0.5&ndash;1%.</div>
    </div>
  </div>
</section>

<section class="cta-band card">
  <div>
    <h2>You do the work. PaidFast does the chasing.</h2>
    <p class="muted">Try the dashboard — ${MODE === 'mock' ? 'simulated payments, real product flow.' : 'live.'}</p>
  </div>
  <a class="btn" href="/app">Open dashboard</a>
</section>`;

  return shell({ title: 'PaidFast — invoice in crypto, get paid without chasing', nav: 'home', body });
}

/* ------------------------------------------------------------- dashboard */

export function dashboard(invoices, totals, at) {
  const rows = [...invoices].reverse().map((inv) => {
    const st = viewStatus(inv, at);
    return `<a class="inv-row" href="/app/invoices/${encodeURIComponent(inv.id)}">
  <div class="inv-main"><b>${esc(inv.client)}</b><span class="sub">${esc(inv.id)} &middot; ${esc(inv.description)}</span></div>
  <div class="inv-amount">${money(inv.amount)} ${esc(inv.token)}<span class="sub">paid ${money(inv.amountPaid || 0)}</span></div>
  <div class="inv-due">${inv.status === 'PAID' ? 'settled' : esc(duePhrase(inv.dueAt, at))}</div>
  ${chipFor(st, inv)}
</a>`;
  }).join('\n');

  const body = `
<div class="page-head">
  <h1>Dashboard</h1>
  <p>Every invoice, watched and chased for you.${MODE === 'mock' ? ' Demo mode — payments are simulated.' : ''}</p>
</div>

<section class="stats">
  <div class="card stat">
    <div class="stat-label">Outstanding</div>
    <div class="stat-num">${money(totals.outstanding)} <small>USD*</small></div>
    <div class="stat-sub">${totals.open} open invoice${totals.open === 1 ? '' : 's'}${totals.overdue ? ` &middot; ${totals.overdue} overdue` : ''}</div>
  </div>
  <div class="card stat">
    <div class="stat-label">Collected</div>
    <div class="stat-num">${money(totals.collected)} <small>USD*</small></div>
    <div class="stat-sub">${totals.paid} invoice${totals.paid === 1 ? '' : 's'} settled in full</div>
  </div>
  <div class="card stat">
    <div class="stat-label">Reminders</div>
    <div class="stat-num">${totals.remindersSent}</div>
    <div class="stat-sub">polite nudges sent so far &middot; <a href="/app/emails">see the emails</a></div>
  </div>
</section>

<div class="dash-grid">
  <div class="card form-card">
    <h2>New invoice</h2>
    <form id="new-invoice" autocomplete="off">
      <label class="field">Client name
        <input name="client" required placeholder="Acme Studio">
      </label>
      <label class="field">Client email <span class="opt">— for delivery &amp; reminders</span>
        <input name="email" type="email" placeholder="billing@acme.com">
      </label>
      <div class="row2">
        <label class="field">Amount
          <input name="amount" required inputmode="decimal" placeholder="500">
        </label>
        <label class="field">Token
          <select name="token"><option>USDT</option><option>USDC</option></select>
        </label>
      </div>
      <label class="field">What&rsquo;s it for?
        <input name="description" required placeholder="Landing page redesign">
      </label>
      <label class="field">Due
        <input name="due" value="7d" list="due-opts">
        <datalist id="due-opts"><option value="2d"></option><option value="7d"></option><option value="14d"></option><option value="30d"></option></datalist>
        <span class="hint">e.g. 7d, 48h, or 2026-07-15</span>
      </label>
      <button class="btn" type="submit" style="width:100%">Create &amp; send invoice</button>
      <div class="form-msg" id="form-msg"></div>
    </form>
  </div>

  <div class="card list-card">
    <div class="list-head"><h2>Invoices</h2><span class="muted small">newest first</span></div>
    ${rows || `<div class="empty">No invoices yet — create your first one on the left.<br><span class="small">It takes about twenty seconds.</span></div>`}
  </div>
</div>`;

  const script = `${JS_API}
const form = document.getElementById('new-invoice');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button');
  const msg = document.getElementById('form-msg');
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.email) delete data.email;
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'Creating invoice\\u2026';
  try {
    const r = await api('/api/invoices', data);
    msg.className = 'form-msg ok';
    msg.textContent = 'Invoice ' + r.invoice.id + ' created \\u2014 opening\\u2026';
    location.href = '/app/invoices/' + encodeURIComponent(r.invoice.id);
  } catch (err) {
    msg.className = 'form-msg err';
    msg.textContent = err.message;
    btn.disabled = false;
  }
});`;

  return shell({ title: 'Dashboard · PaidFast', nav: 'dash', body, script });
}

/* --------------------------------------------------------- invoice detail */

export function invoiceDetail(inv, at) {
  const st = viewStatus(inv, at);
  const paid = inv.status === 'PAID';

  const events = [];
  events.push({ cls: '', at: inv.createdAt, title: `Invoice created${inv.invoiceEmail ? ' and emailed' : ''}`, sub: `due ${humanDate(inv.dueAt)}` });
  for (const r of inv.reminders || []) {
    events.push({ cls: 'rem', at: r.sentAt, title: `Reminder sent — ${esc(r.stage)}`, sub: esc(r.subject || '') });
  }
  for (const p of inv.payments || []) {
    events.push({ cls: 'pay', at: p.at, title: `Payment received — ${money(p.amount)} ${esc(inv.token)}`, sub: `tx ${esc(String(p.txHash).slice(0, 18))}&hellip; &middot; block ${p.blockNumber ?? '—'}` });
  }
  if (inv.receipt) {
    events.push({ cls: 'pay', at: inv.receipt.at, title: 'Receipt sent to both parties', sub: inv.sweep ? esc(inv.sweep.note) : '' });
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  const timeline = events.map((e) =>
    `<li class="${e.cls}"><b>${e.title}</b><br><span class="when">${fmtWhen(e.at)}</span>${e.sub ? `<br><span class="muted small">${e.sub}</span>` : ''}</li>`,
  ).join('\n');

  const body = `
<a class="crumb" href="/app">&larr; Dashboard</a>
<div class="det-head">
  <div>
    <h1>${esc(inv.id)} ${chipFor(st, inv)}${inv.overpaid ? ' <span class="chip chip-partial" title="overpayment flagged for credit/refund">OVERPAID</span>' : ''}</h1>
    <div class="who">${esc(inv.client)}${inv.clientEmail ? ` &middot; ${esc(inv.clientEmail)}` : ''} &middot; ${esc(inv.description)}</div>
  </div>
  <div class="det-actions">
    <button id="btn-watch" class="btn sm"${paid ? ' disabled title="already paid"' : ''}>Check payments now</button>
    <button id="btn-remind" class="btn sm ghost"${paid ? ' disabled title="already paid"' : ''}>Send reminders</button>
  </div>
</div>
<div id="act-msg" class="act-msg info" hidden></div>

<section class="det-grid">
  <div class="card facts">
    <h2>Payment status</h2>
    <div class="fact"><div class="k">Amount</div><div class="v"><b>${money(inv.amount)} ${esc(inv.token)}</b> on ${esc(inv.network?.name || CHAIN.name)}</div></div>
    <div class="fact"><div class="k">Paid so far</div><div class="v">${money(inv.amountPaid || 0)} ${esc(inv.token)}</div></div>
    <div class="fact"><div class="k">Remaining</div><div class="v">${money(inv.remaining ?? inv.amount)} ${esc(inv.token)}</div></div>
    <div class="fact"><div class="k">Due</div><div class="v">${humanDate(inv.dueAt)} <span class="muted">(${paid ? 'settled' : esc(duePhrase(inv.dueAt, at))})</span></div></div>
    <div class="fact"><div class="k">Reference</div><div class="v mono">${esc(inv.reference)}<button class="copy" data-copy="${esc(inv.reference)}" type="button">Copy</button></div></div>
    <div class="fact"><div class="k">Pay address</div><div class="v mono break">${esc(inv.address)}<button class="copy" data-copy="${esc(inv.address)}" type="button">Copy</button><br><span class="muted small">unique to this invoice — this is how payment is matched</span></div></div>
    ${MODE === 'mock' ? `<div class="demo-note"><b>Demo mode:</b> payments are simulated. &ldquo;Check payments now&rdquo; runs one watch pass — the scripted client usually pays by the third check.</div>` : ''}
  </div>

  <div class="card hist">
    <h2>Activity</h2>
    <ul class="tl">
${timeline}
    </ul>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
      ${inv.receipt ? `<a class="btn sm ghost" href="/invoices/${encodeURIComponent(inv.id)}/receipt" target="_blank">View receipt</a>` : ''}
      <a class="btn sm ghost" href="/app/emails?invoice=${encodeURIComponent(inv.id)}">Emails for this invoice</a>
    </div>
  </div>
</section>

<section class="card doc-card">
  <div class="doc-head">
    <h2>Invoice document — what your client sees</h2>
    <a class="btn sm ghost" href="/invoices/${encodeURIComponent(inv.id)}/document" target="_blank">Open full size</a>
  </div>
  <iframe class="doc-frame" src="/invoices/${encodeURIComponent(inv.id)}/document" title="Invoice ${esc(inv.id)} document"></iframe>
</section>`;

  const script = `${JS_API}
const INV = ${JSON.stringify(inv.id)};
const msgBox = document.getElementById('act-msg');
function say(kind, text) {
  msgBox.hidden = false;
  msgBox.className = 'act-msg ' + kind;
  msgBox.textContent = text;
}
function bind(id, run) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => run(el));
}
bind('btn-watch', async (btn) => {
  btn.disabled = true;
  say('info', 'Checking X Layer for a matching transfer\\u2026');
  try {
    const r = await api('/api/watch', {});
    const mine = (r.events || []).filter((e) => e.invoiceId === INV);
    if (mine.length === 0) {
      say('warn', 'No payment on this pass \\u2014 the watcher keeps checking.' +
        (r.mode === 'mock' ? ' (Demo: the scripted client usually pays by the third check.)' : ''));
      btn.disabled = false;
    } else {
      say('good', mine.map((e) => e.summary).join(' '));
      setTimeout(() => location.reload(), 1400);
    }
  } catch (err) { say('warn', err.message); btn.disabled = false; }
});
bind('btn-remind', async (btn) => {
  btn.disabled = true;
  say('info', 'Running the collections pass\\u2026');
  try {
    const r = await api('/api/remind', {});
    const mine = (r.events || []).filter((e) => e.invoiceId === INV);
    if (mine.length === 0) {
      say('info', 'Nothing to send right now \\u2014 reminders fire at due\\u22122d, day-of, and due+3d, and never double-send.');
      btn.disabled = false;
    } else {
      say('good', mine.map((e) => e.summary).join(' '));
      setTimeout(() => location.reload(), 1400);
    }
  } catch (err) { say('warn', err.message); btn.disabled = false; }
});
for (const b of document.querySelectorAll('.copy')) {
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) {}
    const t = b.textContent;
    b.textContent = 'Copied';
    setTimeout(() => { b.textContent = t; }, 1200);
  });
}`;

  return shell({ title: `${inv.id} · PaidFast`, nav: 'dash', body, script });
}

/* ----------------------------------------------------------------- emails */

const KIND_LABEL = {
  'invoice': ['Invoice', 'chip-sent'],
  'reminder-gentle': ['Reminder · gentle', 'chip-partial'],
  'reminder-due': ['Reminder · due', 'chip-partial'],
  'reminder-escalation': ['Reminder · escalation', 'chip-overdue'],
  'receipt-client': ['Receipt · client', 'chip-paid'],
  'receipt-owner': ['Receipt · you', 'chip-paid'],
};

function kindChip(kind) {
  const [label, cls] = KIND_LABEL[kind] || [kind, 'chip-sent'];
  return `<span class="chip ${cls}">${esc(label)}</span>`;
}

export function emailsPage(emails, filterInvoice) {
  const filtered = filterInvoice
    ? emails.filter((e) => (e.invoiceId || '').toUpperCase() === filterInvoice.toUpperCase())
    : emails;

  const rows = filtered.map((e) => `<a class="mail-row" href="/app/emails/${encodeURIComponent(e.name)}">
  ${kindChip(e.kind)}
  <div class="mail-main"><b>${esc(e.subject)}</b><span class="sub">to ${esc(e.to)}${e.invoiceId ? ` &middot; ${esc(e.invoiceId)}` : ''}</span></div>
  <span class="mail-date">${esc(e.date.replace(/ GMT$/, ''))}</span>
</a>`).join('\n');

  const body = `
<div class="page-head">
  <h1>Emails</h1>
  <p>Every email PaidFast ${MODE === 'mock' ? 'writes on your behalf (demo: saved to disk instead of delivered)' : 'sends on your behalf'} — this is exactly what your client receives.</p>
</div>
${filterInvoice ? `<p style="margin:-8px 0 14px"><span class="chip chip-sent">filtered: ${esc(filterInvoice)}</span> <a class="small" href="/app/emails">show all</a></p>` : ''}
<div class="card list-card" style="margin-bottom:46px">
  <div class="list-head"><h2>Outbox</h2><span class="muted small">${filtered.length} email${filtered.length === 1 ? '' : 's'}, newest first</span></div>
  ${rows || `<div class="empty">No emails yet.<br><span class="small">Create an invoice with a client email and they&rsquo;ll appear here.</span></div>`}
</div>`;

  return shell({ title: 'Emails · PaidFast', nav: 'emails', body });
}

export function emailView(email) {
  const body = `
<a class="crumb" href="/app/emails">&larr; All emails</a>
<div class="page-head" style="padding-top:14px">
  <h1 style="font-size:22px">${esc(email.subject)} ${kindChip(email.kind)}</h1>
</div>
<div class="card mail-view">
  <div class="mail-headers">
    <div class="fact"><div class="k">From</div><div class="v">${esc(email.from)}</div></div>
    <div class="fact"><div class="k">To</div><div class="v">${esc(email.to)}</div></div>
    <div class="fact"><div class="k">Date</div><div class="v">${esc(email.date)}</div></div>
    ${email.invoiceId ? `<div class="fact"><div class="k">Invoice</div><div class="v"><a href="/app/invoices/${encodeURIComponent(email.invoiceId)}">${esc(email.invoiceId)}</a></div></div>` : ''}
    ${email.attachments.length ? `<div class="fact"><div class="k">Attached</div><div class="v muted small">${email.attachments.map(esc).join('<br>')}</div></div>` : ''}
    ${email.mode ? `<div class="fact"><div class="k">Delivery</div><div class="v muted small">${esc(email.mode)}</div></div>` : ''}
  </div>
  <div class="mail-body">${esc(email.body)}</div>
</div>
<div style="height:46px"></div>`;

  return shell({ title: `${email.subject} · PaidFast`, nav: 'emails', body });
}

/* ------------------------------------------------------------------ misc */

export function errorPage(code, message, detail = '') {
  const body = `
<div class="page-head" style="padding-top:70px;text-align:center">
  <h1 style="justify-content:center;font-size:44px">${code}</h1>
  <p style="font-size:17px">${esc(message)}</p>
  ${detail ? `<p class="muted small" style="margin-top:6px">${esc(detail)}</p>` : ''}
  <p style="margin-top:22px"><a class="btn" href="/app">Back to dashboard</a></p>
</div>
<div style="height:80px"></div>`;
  return shell({ title: `${code} · PaidFast`, body });
}
