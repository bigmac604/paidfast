// Email adapter.
//
// MOCK MODE (default): writes RFC-822-style .eml files to out/emails/ so the
// whole flow is inspectable (they open in any mail client). Attachments are
// referenced by path in an X-PaidFast-Attachment header + body footer instead
// of being MIME-encoded — good enough to demo, honest about being a mock.
//
// REAL MODE — STUB (no credentials yet). Two documented options:
//   A. Resend (simplest):
//        POST https://api.resend.com/emails
//        Authorization: Bearer $RESEND_API_KEY
//        { from, to, subject, text, attachments: [{ filename, content(b64) }] }
//   B. SMTP via nodemailer (adds a dependency — install only when wiring):
//        npm i nodemailer
//        createTransport({ host: SMTP_HOST, port: 587, auth: { user, pass } })
//   Env placeholders: RESEND_API_KEY  or  SMTP_HOST/SMTP_USER/SMTP_PASS.

import fs from 'node:fs';
import path from 'node:path';
import { MODE, OWNER, PATHS, now } from '../config.js';
import { NotConfiguredError } from '../util.js';

let seq = 0; // per-process tiebreaker for filenames

/**
 * Send one email.
 * @param {object} msg
 * @param {string} msg.to           recipient, "Name <addr>" or bare address
 * @param {string} msg.subject
 * @param {string} msg.text         plain-text body (reminders/receipts are text)
 * @param {string} [msg.kind]       e.g. invoice | reminder-gentle | receipt-client
 * @param {string} [msg.invoiceId]
 * @param {string[]} [msg.attachments]  file paths (mock: referenced, real: attached)
 * @returns {Promise<{delivered: boolean, mode: string, file?: string}>}
 */
export async function sendEmail(msg) {
  if (MODE === 'mock') return mockSend(msg);

  throw new NotConfiguredError('Real email delivery is not wired yet.', [
    'Option A — Resend: set RESEND_API_KEY and POST https://api.resend.com/emails',
    '  { from, to, subject, text, attachments } with Authorization: Bearer <key>.',
    'Option B — SMTP: npm i nodemailer, set SMTP_HOST/SMTP_USER/SMTP_PASS,',
    '  transporter.sendMail({ from, to, subject, text, attachments }).',
    'Implement inside src/adapters/email.js — callers never change.',
  ]);
}

function mockSend(msg) {
  fs.mkdirSync(PATHS.emailsDir, { recursive: true });

  const at = now();
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  seq += 1;
  const kind = msg.kind || 'email';
  const name = `${stamp}_${String(seq).padStart(2, '0')}_${kind}${msg.invoiceId ? `_${msg.invoiceId}` : ''}.eml`;
  const file = path.join(PATHS.emailsDir, name);

  const headers = [
    `From: ${OWNER.name} via PaidFast <${OWNER.fromEmail}>`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    `Date: ${at.toUTCString()}`,
    `Message-ID: <pf-${at.getTime()}-${seq}@paidfast.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    `X-PaidFast-Kind: ${kind}`,
    msg.invoiceId ? `X-PaidFast-Invoice: ${msg.invoiceId}` : null,
    'X-PaidFast-Mode: mock (written to disk, not delivered)',
    ...(msg.attachments || []).map((a) => `X-PaidFast-Attachment: ${a}`),
  ].filter(Boolean);

  let body = msg.text || '';
  if (msg.attachments?.length) {
    body += `\n\n--\n[mock] attached in real mode: ${msg.attachments.join(', ')}\n`;
  }

  fs.writeFileSync(file, headers.join('\r\n') + '\r\n\r\n' + body + '\r\n', 'utf8');
  return { delivered: true, mode: 'mock', file };
}
