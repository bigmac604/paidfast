// PaidFast demo — the 90-second story, scripted.
//
//   npm run demo
//
//   create invoice → 2 watch passes (unpaid) → gentle reminder fires →
//   payment arrives on the next watch → receipt to both parties + sweep.
//
// Runs on its OWN state files (state/demo-*.json) so it never touches your
// real invoices, and resets them on every run — safe to replay forever.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Must happen BEFORE importing src modules (config reads env at import time).
process.env.OKX_MODE = 'mock';
process.env.PAIDFAST_STATE_FILE = path.join(ROOT, 'state', 'demo-invoices.json');
process.env.PAIDFAST_MOCK_CHAIN_FILE = path.join(ROOT, 'state', 'demo-mock-chain.json');
fs.rmSync(process.env.PAIDFAST_STATE_FILE, { force: true });
fs.rmSync(process.env.PAIDFAST_MOCK_CHAIN_FILE, { force: true });

const { c, sym, sleep } = await import('../src/util.js');
const { loadState } = await import('../src/store.js');
const { cmdCreate } = await import('../src/commands/create.js');
const { cmdWatch } = await import('../src/commands/watch.js');
const { cmdRemind } = await import('../src/commands/remind.js');
const { cmdList } = await import('../src/commands/list.js');

const t0 = Date.now();
const stamp = () => c.dim(`[T+${((Date.now() - t0) / 1000).toFixed(1).padStart(4)}s]`);
const say = (msg) => console.log(`  ${stamp()} ${msg}`);
const pause = (ms = 700) => sleep(ms);

function scene(n, title, subtitle) {
  console.log('');
  console.log(`  ${c.bold(c.magenta(`SCENE ${n}`))} ${c.dim('·')} ${c.bold(title)}`);
  if (subtitle) console.log(`  ${c.dim(subtitle)}`);
  console.log(`  ${c.dim(sym.hr())}`);
}

/* ------------------------------------------------------------------ intro */

console.log('');
console.log(`  ${c.bold(`${sym.bolt} PAIDFAST`)} ${c.dim('· demo · mock mode — simulated X Layer transfers, emails land in out/emails/')}`);
console.log(`  ${c.bold('"You did the work. Now you get to spend a week asking to be paid."')}`);
console.log(`  ${c.dim("…or you don't. Watch:")}`);

/* -------------------------------------------------- scene 1: the invoice */

scene(1, 'The ask', '"Invoice Acme $500 for the landing page redesign, due in 2 days."');
await pause(600);

const invoice = await cmdCreate({
  client: 'Acme Studio',
  email: 'billing@acme.example',
  amount: '500',
  for: 'landing page redesign',
  due: '2d',
});

say(`one command ${sym.arrow} invoice record, polished HTML invoice, unique deposit address, email to the client.`);
await pause(900);

/* --------------------------------------------- scene 2: watching, unpaid */

scene(2, 'The watcher', 'PaidFast polls X Layer for a matching USDT transfer. Days pass; nothing yet.');
await pause(600);

await cmdWatch({}); // pass 1 — nothing
say('no payment yet — no drama, the agent just keeps watching.');
await pause(800);

await cmdWatch({}); // pass 2 — nothing
say(`still nothing. Due date is closing in ${sym.arrow} time for the collections loop.`);
await pause(900);

/* ---------------------------------------------------- scene 3: the nudge */

scene(3, 'The nudge', 'Inside the due−2d window and unpaid — the gentle reminder goes out by itself.');
await pause(600);

await cmdRemind();

// Show the actual words the client receives — the copy IS the product.
const reminded = loadState().invoices.find((i) => i.id === invoice.id);
const reminderFile = reminded?.reminders?.[0]?.file;
if (reminderFile && fs.existsSync(reminderFile)) {
  const eml = fs.readFileSync(reminderFile, 'utf8');
  const subject = eml.split(/\r?\n/).find((l) => l.startsWith('Subject:'));
  const body = eml.split(/\r?\n\r?\n/).slice(1).join('\n\n').split(/\r?\n/);
  console.log(`  ${c.dim('┌─ what Acme actually receives ─────────────────────────')}`);
  console.log(`  ${c.dim('│')} ${c.bold(subject)}`);
  for (const line of body.slice(0, 7)) console.log(`  ${c.dim('│')} ${line}`);
  console.log(`  ${c.dim('│ …')}`);
  console.log(`  ${c.dim('└────────────────────────────────────────────────────────')}`);
}
say('polite, human, effective — and it never double-sends. Firmer copy at due date, escalation at due+3d.');
await pause(1000);

/* ------------------------------------------------- scene 4: payment lands */

scene(4, 'Payment lands', 'The reminder worked. Acme sends 500 USDT on X Layer.');
await pause(600);

await cmdWatch({}); // pass 3 — the mock transfer arrives (default pay-on = 3)
say(`matched by unique deposit address ${sym.arrow} receipt to both parties ${sym.arrow} sweep step queued. Hands-free.`);
await pause(900);

/* --------------------------------------------------- scene 5: the ledger */

scene(5, 'The ledger', 'Everything accounted for, everything on disk.');
await cmdList({});

const paid = loadState().invoices.find((i) => i.id === invoice.id);
console.log(`  ${c.bold('Artifacts from this run:')}`);
console.log(`    invoice   ${c.cyan(paid.invoiceHtml)}`);
console.log(`    reminder  ${c.cyan(path.relative(ROOT, reminderFile ?? '').replaceAll('\\', '/'))}`);
console.log(`    receipt   ${c.cyan(paid.receipt.file)}`);
console.log(`    emails    ${c.cyan('out/emails/')} ${c.dim('(open any .eml in a mail client)')}`);
console.log('');
console.log(`  ${c.dim(sym.hr())}`);
console.log(`  ${c.bold(`${sym.ok} Lifecycle complete in ${((Date.now() - t0) / 1000).toFixed(1)}s:`)} create ${sym.arrow} watch ${sym.arrow} remind ${sym.arrow} paid ${sym.arrow} receipt ${sym.arrow} sweep`);
console.log(`  ${c.bold('You do the work. PaidFast does the chasing.')}`);
console.log(`  ${c.dim('Partial payments: watch --scenario partial · Overpayments: watch --scenario over · Real rails: STATUS.md')}`);
console.log('');
