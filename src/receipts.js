// What happens the moment an invoice flips to PAID:
//   1. Render the HTML receipt to out/receipts/
//   2. Email the client (receipt) and the freelancer ("you got paid", with
//      an overpayment flag when relevant)
//   3. Run the sweep-to-stables step via the chain adapter (mock: logged)

import fs from 'node:fs';
import path from 'node:path';
import { PATHS, OWNER, ROOT } from './config.js';
import { c, sym } from './util.js';
import { buildFacts } from './facts.js';
import { receiptHtml } from './templates.js';
import { generateEmailCopy } from './adapters/llm.js';
import { sendEmail } from './adapters/email.js';
import * as chain from './adapters/chain.js';

export async function handleInvoicePaid(invoice, at) {
  const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/');

  // 1. HTML receipt
  fs.mkdirSync(PATHS.receiptsDir, { recursive: true });
  const receiptFile = path.join(PATHS.receiptsDir, `${invoice.id}-receipt.html`);
  fs.writeFileSync(receiptFile, receiptHtml(invoice), 'utf8');
  invoice.receipt = { file: rel(receiptFile), at: at.toISOString() };
  console.log(`    ${sym.ok} receipt rendered ${c.dim(rel(receiptFile))}`);

  // 2. Receipt emails — both parties
  const facts = buildFacts(invoice, at);
  if (invoice.clientEmail) {
    const copy = await generateEmailCopy('receipt-client', facts);
    const sent = await sendEmail({
      to: `${invoice.client} <${invoice.clientEmail}>`,
      subject: copy.subject,
      text: copy.text,
      kind: 'receipt-client',
      invoiceId: invoice.id,
      attachments: [invoice.receipt.file],
    });
    console.log(`    ${sym.mail} receipt emailed to client ${c.dim(rel(sent.file))}`);
  } else {
    console.log(`    ${sym.warn} no client email on file — receipt saved to disk only`);
  }
  const ownerCopy = await generateEmailCopy('receipt-owner', facts);
  const ownerSent = await sendEmail({
    to: `${OWNER.name} <${OWNER.email}>`,
    subject: ownerCopy.subject,
    text: ownerCopy.text,
    kind: 'receipt-owner',
    invoiceId: invoice.id,
    attachments: [invoice.receipt.file],
  });
  console.log(`    ${sym.mail} "you got paid" emailed to you ${c.dim(rel(ownerSent.file))}`);

  // 3. Sweep step (mock: logs; real: OKX convert/trade — stub documents the call)
  const sweep = await chain.sweepToStables(invoice);
  invoice.sweep = sweep;
  console.log(`    ${sym.bolt} sweep: ${sweep.note} ${c.dim(`[${sweep.mode}]`)}`);
}
