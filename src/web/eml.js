// Email store reader for the web viewer — parses the RFC-822-style .eml files
// the mock email adapter writes to out/emails/ (subject / to / date / kind /
// invoice id / body). "This is what your client receives."
//
// Names are strictly validated so the HTTP layer can never be tricked into
// reading outside out/emails/.

import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '../config.js';

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.eml$/;

/** All emails, newest first (filenames are timestamp-prefixed → lexical sort). */
export function listEmails() {
  let names;
  try {
    names = fs.readdirSync(PATHS.emailsDir);
  } catch {
    return []; // out/emails/ doesn't exist yet — nothing sent
  }
  const emails = [];
  for (const name of names) {
    if (!SAFE_NAME.test(name)) continue;
    const parsed = readEmail(name);
    if (parsed) emails.push(parsed);
  }
  return emails.sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** One parsed email, or null when the name is invalid / file unreadable. */
export function readEmail(name) {
  if (!SAFE_NAME.test(String(name || ''))) return null;
  const file = path.resolve(PATHS.emailsDir, name);
  if (path.dirname(file) !== path.resolve(PATHS.emailsDir)) return null; // belt & braces
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  return parseEml(name, raw);
}

function parseEml(name, raw) {
  let sepIdx = raw.indexOf('\r\n\r\n');
  let sepLen = 4;
  if (sepIdx === -1) {
    sepIdx = raw.indexOf('\n\n');
    sepLen = 2;
  }
  const head = sepIdx === -1 ? raw : raw.slice(0, sepIdx);
  const body = sepIdx === -1 ? '' : raw.slice(sepIdx + sepLen);

  const headers = {};
  const attachments = [];
  for (const line of head.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === 'x-paidfast-attachment') attachments.push(value);
    else headers[key] = value;
  }

  return {
    name,
    subject: headers.subject || '(no subject)',
    to: headers.to || '',
    from: headers.from || '',
    date: headers.date || '',
    kind: headers['x-paidfast-kind'] || 'email',
    invoiceId: headers['x-paidfast-invoice'] || null,
    mode: headers['x-paidfast-mode'] || '',
    attachments,
    body: body.replace(/\r\n/g, '\n').trimEnd(),
  };
}
