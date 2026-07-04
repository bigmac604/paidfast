#!/usr/bin/env node
// PaidFast web layer — zero-dependency node:http server.
//
//   npm run serve            → http://localhost:4104   (PORT env overrides)
//
// Serves the landing page, the dashboard, invoice detail, the emails viewer,
// and the JSON service API (documented in STATUS.md — this API is the seam
// where the hosted service goes). It drives the SAME engine + state file as
// the CLI (state/invoices.json); `npm run demo` keeps its own state/demo-*.json,
// so the demo can never touch dashboard data.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODE, now } from './config.js';
import { c, sym, UsageError, NotConfiguredError, formatAmount } from './util.js';
import { loadState, findInvoice, openInvoices } from './store.js';
import { cmdCreate } from './commands/create.js';
import { cmdWatch } from './commands/watch.js';
import { cmdRemind } from './commands/remind.js';
import { invoiceHtml, receiptHtml } from './templates.js';
import { listEmails, readEmail } from './web/eml.js';
import * as pages from './web/pages.js';
import { gateInvoiceCreation, x402Mode } from './x402/gate.js';

const DEFAULT_PORT = 4104;
const MAX_BODY = 64 * 1024;

/* ----------------------------------------------------------- state utils */

/** Dashboard totals: outstanding vs collected, open/overdue/paid counts. */
function computeTotals(invoices, at) {
  const t = { outstanding: 0, collected: 0, open: 0, overdue: 0, paid: 0, remindersSent: 0, count: invoices.length };
  for (const inv of invoices) {
    t.collected += inv.amountPaid || 0;
    t.remindersSent += (inv.reminders || []).length;
    if (inv.status === 'PAID') { t.paid += 1; continue; }
    t.open += 1;
    t.outstanding += inv.remaining ?? inv.amount;
    if (new Date(inv.dueAt).getTime() < at.getTime()) t.overdue += 1;
  }
  return t;
}

// The engine commands each do load→mutate→save; serialize them so two HTTP
// requests can never interleave a read-modify-write on state/invoices.json.
let queue = Promise.resolve();
function withLock(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

/* ------------------------------------------------------------- api logic */

async function apiCreateInvoice(body) {
  return withLock(async () => {
    const invoice = await cmdCreate({
      client: body.client,
      amount: body.amount != null ? String(body.amount) : undefined,
      for: body.description ?? body.for,
      due: body.due || undefined,
      email: body.email || undefined,
      token: body.token || undefined,
    });
    return { ok: true, invoice };
  });
}

/** One watch pass over all open invoices; events = what changed. */
async function apiWatch(body) {
  return withLock(async () => {
    const before = new Map(loadState().invoices.map((i) => [i.id, {
      status: i.status, payments: (i.payments || []).length,
    }]));

    await cmdWatch({
      scenario: body.scenario,
      'pay-on': body.payOn ?? body['pay-on'],
    });

    const state = loadState();
    const events = [];
    for (const inv of state.invoices) {
      const prev = before.get(inv.id);
      if (!prev) continue;
      for (const p of (inv.payments || []).slice(prev.payments)) {
        const done = inv.status === 'PAID';
        events.push({
          invoiceId: inv.id,
          type: 'payment',
          amount: p.amount,
          token: inv.token,
          txHash: p.txHash,
          status: inv.status,
          summary: done
            ? `${fmt(p.amount)} ${inv.token} arrived — invoice PAID in full${inv.overpaid ? ` (overpaid by ${fmt(inv.overpaidBy)} ${inv.token}, flagged)` : ''}. Receipts sent to both parties.`
            : `${fmt(p.amount)} ${inv.token} arrived — PARTIAL payment, ${fmt(inv.remaining)} ${inv.token} remaining.`,
        });
      }
      if (prev.status !== inv.status) {
        events.push({ invoiceId: inv.id, type: 'status', from: prev.status, to: inv.status });
      }
    }
    return {
      ok: true,
      mode: MODE,
      events,
      stillOpen: openInvoices(state).length,
      totals: computeTotals(state.invoices, now()),
    };
  });
}

/** One collections pass; events = reminders actually sent. */
async function apiRemind() {
  return withLock(async () => {
    const before = new Map(loadState().invoices.map((i) => [i.id, (i.reminders || []).length]));
    const { sent } = await cmdRemind();
    const state = loadState();
    const events = [];
    for (const inv of state.invoices) {
      for (const r of (inv.reminders || []).slice(before.get(inv.id) ?? 0)) {
        events.push({
          invoiceId: inv.id,
          type: 'reminder',
          stage: r.stage,
          subject: r.subject,
          summary: `${cap(r.stage)} reminder sent to ${inv.clientEmail || 'the client'} — "${r.subject}".`,
        });
      }
    }
    return { ok: true, mode: MODE, sent, events };
  });
}

const fmt = formatAmount;
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/* -------------------------------------------------------------- plumbing */

function send(res, code, type, body, extra = {}) {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
  res.end(body);
}
const sendHtml = (res, code, html) => send(res, code, 'text/html; charset=utf-8', html);
const sendJson = (res, code, obj, extra = {}) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj, null, 2) + '\n', extra);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new UsageError('Request body too large.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new UsageError('Body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

/* ---------------------------------------------------------------- routes */

const ROUTES = [
  // pages -------------------------------------------------------------
  ['GET', /^\/$/, async (_req, res) => sendHtml(res, 200, pages.landing())],

  ['GET', /^\/app\/?$/, async (_req, res) => {
    const state = loadState();
    const at = now();
    sendHtml(res, 200, pages.dashboard(state.invoices, computeTotals(state.invoices, at), at));
  }],

  ['GET', /^\/app\/invoices\/([^/]+)$/, async (_req, res, [id]) => {
    const inv = findInvoice(loadState(), id);
    if (!inv) return sendHtml(res, 404, pages.errorPage(404, `No invoice "${id}".`));
    sendHtml(res, 200, pages.invoiceDetail(inv, now()));
  }],

  ['GET', /^\/app\/emails\/?$/, async (_req, res, _p, url) => {
    sendHtml(res, 200, pages.emailsPage(listEmails(), url.searchParams.get('invoice')));
  }],

  ['GET', /^\/app\/emails\/([^/]+)$/, async (_req, res, [name]) => {
    const email = readEmail(name);
    if (!email) return sendHtml(res, 404, pages.errorPage(404, 'That email could not be found.', name));
    sendHtml(res, 200, pages.emailView(email));
  }],

  // rendered documents (iframe targets) --------------------------------
  ['GET', /^\/invoices\/([^/]+)\/document$/, async (_req, res, [id]) => {
    const inv = findInvoice(loadState(), id);
    if (!inv) return sendHtml(res, 404, pages.errorPage(404, `No invoice "${id}".`));
    sendHtml(res, 200, invoiceHtml(inv));
  }],

  ['GET', /^\/invoices\/([^/]+)\/receipt$/, async (_req, res, [id]) => {
    const inv = findInvoice(loadState(), id);
    if (!inv) return sendHtml(res, 404, pages.errorPage(404, `No invoice "${id}".`));
    if (inv.status !== 'PAID') {
      return sendHtml(res, 404, pages.errorPage(404, 'No receipt yet — this invoice has not been paid in full.'));
    }
    sendHtml(res, 200, receiptHtml(inv));
  }],

  ['GET', /^\/favicon\.(ico|svg)$/, async (_req, res) =>
    send(res, 200, 'image/svg+xml', pages.FAVICON_RAW, { 'cache-control': 'public, max-age=86400' })],

  // service API ---------------------------------------------------------
  ['GET', /^\/api\/health$/, async (_req, res) => {
    const state = loadState();
    sendJson(res, 200, { ok: true, service: 'paidfast', mode: MODE, invoices: state.invoices.length, time: now().toISOString() });
  }],

  ['GET', /^\/api\/invoices$/, async (_req, res) => {
    const state = loadState();
    const at = now();
    sendJson(res, 200, {
      ok: true,
      mode: MODE,
      totals: computeTotals(state.invoices, at),
      invoices: state.invoices.map((inv) => ({ ...inv, derivedStatus: pages.viewStatus(inv, at) })),
    });
  }],

  // The ONLY x402-gated route: invoice creation, the listed 1-USDT-per-call
  // A2MCP service. With X402_MODE=off (default) the gate is transparent and
  // this behaves exactly as before. NOTE: this fee is charged to the
  // FREELANCER for issuing the invoice — the invoice itself is paid by their
  // client on X Layer separately (chain adapter), a completely distinct layer.
  ['POST', /^\/api\/invoices$/, async (req, res) => {
    // Gate reads PAYMENT-SIGNATURE (v2) first, then legacy X-PAYMENT.
    const gate = await gateInvoiceCreation(req.headers);
    if (!gate.ok) return sendJson(res, gate.status, gate.body, gate.headers);
    const body = await readBody(req);
    const result = await apiCreateInvoice(body);
    if (gate.receipt) {
      result.x402 = { settled: true, mode: gate.mode, transaction: gate.receipt.transaction };
    }
    sendJson(res, 201, result, gate.headers);
  }],

  ['GET', /^\/api\/invoices\/([^/]+)$/, async (_req, res, [id]) => {
    const inv = findInvoice(loadState(), id);
    if (!inv) return sendJson(res, 404, { ok: false, error: `No invoice "${id}".` });
    sendJson(res, 200, { ok: true, invoice: { ...inv, derivedStatus: pages.viewStatus(inv, now()) } });
  }],

  ['POST', /^\/api\/watch$/, async (req, res) => {
    const body = await readBody(req);
    sendJson(res, 200, await apiWatch(body));
  }],

  ['POST', /^\/api\/remind$/, async (req, res) => {
    await readBody(req); // accept (and ignore) an empty JSON body
    sendJson(res, 200, await apiRemind());
  }],

  ['GET', /^\/api\/emails$/, async (_req, res, _p, url) => {
    const filter = url.searchParams.get('invoice');
    let emails = listEmails().map(({ body, ...rest }) => rest);
    if (filter) emails = emails.filter((e) => (e.invoiceId || '').toUpperCase() === filter.toUpperCase());
    sendJson(res, 200, { ok: true, count: emails.length, emails });
  }],

  ['GET', /^\/api\/emails\/([^/]+)$/, async (_req, res, [name]) => {
    const email = readEmail(name);
    if (!email) return sendJson(res, 404, { ok: false, error: 'No such email.' });
    sendJson(res, 200, { ok: true, email });
  }],
];

/* ---------------------------------------------------------------- server */

export function createPaidfastServer() {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const isApi = url.pathname.startsWith('/api/');

    res.on('finish', () => {
      console.log(c.dim(`  ${req.method} ${url.pathname} → ${res.statusCode} (${Date.now() - started}ms)`));
    });

    try {
      for (const [method, pattern, handler] of ROUTES) {
        if (req.method !== method) continue;
        const m = pattern.exec(url.pathname);
        if (!m) continue;
        await handler(req, res, m.slice(1).map((s) => decodeURIComponent(s)), url);
        return;
      }
      if (isApi) return sendJson(res, 404, { ok: false, error: `No route ${req.method} ${url.pathname}` });
      return sendHtml(res, 404, pages.errorPage(404, 'That page does not exist.'));
    } catch (err) {
      if (err instanceof UsageError) {
        if (isApi) return sendJson(res, 400, { ok: false, error: err.message });
        return sendHtml(res, 400, pages.errorPage(400, err.message));
      }
      if (err instanceof NotConfiguredError) {
        const detail = `${err.message} Hints: ${err.hints.join(' ')}`;
        if (isApi) return sendJson(res, 501, { ok: false, error: err.message, hints: err.hints });
        return sendHtml(res, 501, pages.errorPage(501, err.message, detail));
      }
      console.error(c.red(`  ${sym.fail} ${req.method} ${url.pathname}: ${err.stack || err.message}`));
      if (isApi) return sendJson(res, 500, { ok: false, error: 'Internal error — see server log.' });
      return sendHtml(res, 500, pages.errorPage(500, 'Something went wrong — see the server log.'));
    }
  });
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const server = createPaidfastServer();
  server.listen(port, () => {
    console.log('');
    console.log(`  ${c.bold(`${sym.bolt} PaidFast web`)} — ${c.cyan(`http://localhost:${port}`)}  ${c.dim(`[mode: ${MODE} · x402: ${x402Mode()}]`)}`);
    console.log(c.dim(`    landing /   ·   dashboard /app   ·   emails /app/emails   ·   API /api/health`));
    console.log(c.dim(`    Ctrl+C to stop`));
    console.log('');
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
