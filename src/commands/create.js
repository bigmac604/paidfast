// `paidfast create` — turn a plain ask into an invoice:
//   node src/index.js create --client "Acme" --amount 500 --for "landing page" \
//                            --due 7d [--email billing@acme.com] [--token USDT]
// Produces: invoice record (state), polished HTML invoice (out/invoices/),
// and — when a client email is given — the invoice email via the email adapter.

import fs from 'node:fs';
import path from 'node:path';
import { PATHS, CHAIN, OWNER, ROOT, MODE, now } from '../config.js';
import {
  UsageError, parseDue, formatAmount, humanDate, newReference, c, sym,
} from '../util.js';
import { loadState, saveState, nextInvoiceId } from '../store.js';
import { invoiceHtml } from '../templates.js';
import { buildFacts } from '../facts.js';
import { generateEmailCopy } from '../adapters/llm.js';
import { sendEmail } from '../adapters/email.js';
import * as chain from '../adapters/chain.js';

export async function cmdCreate(opts) {
  const client = String(opts.client || '').trim();
  if (!client) throw new UsageError('Missing --client "Name". Who is this invoice for?');

  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
    throw new UsageError(`--amount must be a positive number (got "${opts.amount}").`);
  }

  const token = String(opts.token || 'USDT').toUpperCase();
  if (!CHAIN.tokens[token]) {
    throw new UsageError(`--token must be one of: ${Object.keys(CHAIN.tokens).join(', ')}`);
  }

  const description = String(opts.for || 'services rendered').trim();
  const clientEmail = opts.email ? String(opts.email).trim() : null;
  if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    throw new UsageError(`--email "${clientEmail}" does not look like an email address.`);
  }

  const at = now();
  const dueAt = parseDue(opts.due || '7d', at);

  const state = loadState();
  const reference = newReference(new Set(state.invoices.map((i) => i.reference)));

  const invoice = {
    id: nextInvoiceId(state),
    reference,
    client,
    clientEmail,
    description,
    token,
    amount,
    amountPaid: 0,
    remaining: amount,
    overpaid: false,
    overpaidBy: 0,
    network: { name: CHAIN.name, chainId: CHAIN.chainId },
    address: chain.getDepositAddress(reference),
    status: 'SENT',
    createdAt: at.toISOString(),
    dueAt: dueAt.toISOString(),
    payments: [],
    reminders: [],
    receipt: null,
    sweep: null,
  };

  // Render the HTML invoice
  fs.mkdirSync(PATHS.invoicesDir, { recursive: true });
  const htmlFile = path.join(PATHS.invoicesDir, `${invoice.id}.html`);
  fs.writeFileSync(htmlFile, invoiceHtml(invoice), 'utf8');
  const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/');
  invoice.invoiceHtml = rel(htmlFile);

  // Email it to the client (via adapter) when we have an address
  let emailNote = `${sym.warn} no --email given — send ${c.bold(rel(htmlFile))} to the client yourself`;
  if (clientEmail) {
    const copy = await generateEmailCopy('invoice', buildFacts(invoice, at));
    const sent = await sendEmail({
      to: `${client} <${clientEmail}>`,
      subject: copy.subject,
      text: copy.text,
      kind: 'invoice',
      invoiceId: invoice.id,
      attachments: [invoice.invoiceHtml],
    });
    invoice.invoiceEmail = rel(sent.file);
    emailNote = `${sym.mail} invoice emailed to ${clientEmail} ${c.dim(rel(sent.file))}`;
  }

  state.invoices.push(invoice);
  saveState(state);

  console.log('');
  console.log(`  ${c.bold(c.green(`${sym.ok} Invoice ${invoice.id} created`))} ${c.dim(`[${MODE}]`)}`);
  console.log(`    ${c.dim('bill to')}    ${client}${clientEmail ? c.dim(` <${clientEmail}>`) : ''}`);
  console.log(`    ${c.dim('for')}        ${description}`);
  console.log(`    ${c.dim('amount')}     ${c.bold(`${formatAmount(amount)} ${token}`)} on ${CHAIN.network}`);
  console.log(`    ${c.dim('due')}        ${humanDate(dueAt)}`);
  console.log(`    ${c.dim('reference')}  ${c.cyan(reference)}`);
  console.log(`    ${c.dim('address')}    ${invoice.address} ${c.dim('(unique to this invoice)')}`);
  console.log(`    ${sym.ok} invoice HTML ${c.bold(rel(htmlFile))} ${c.dim('(print → save as PDF)')}`);
  console.log(`    ${emailNote}`);
  console.log(`    ${c.dim(`next: node src/index.js watch   — I'll flag the payment when it lands`)}`);
  console.log('');

  return invoice;
}
