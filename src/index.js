#!/usr/bin/env node
// PaidFast CLI — crypto invoicing & payment-collection agent for freelancers.
//
//   node src/index.js create --client "Acme" --amount 500 --for "landing page" --due 7d [--email a@b.co]
//   node src/index.js watch [--loop] [--interval 15] [--scenario full|partial|over] [--pay-on 3]
//   node src/index.js remind
//   node src/index.js list [--json]
//
// Mode: OKX_MODE=mock (default) | real — see STATUS.md for real-mode wiring.

import { parseArgs } from 'node:util';
import { MODE } from './config.js';
import { c, sym, UsageError, NotConfiguredError } from './util.js';
import { cmdCreate } from './commands/create.js';
import { cmdWatch } from './commands/watch.js';
import { cmdRemind } from './commands/remind.js';
import { cmdList } from './commands/list.js';

const COMMANDS = {
  create: {
    run: cmdCreate,
    options: {
      client: { type: 'string' },
      amount: { type: 'string' },
      for: { type: 'string' },
      due: { type: 'string' },
      email: { type: 'string' },
      token: { type: 'string' },
    },
    help: 'create --client "Acme" --amount 500 --for "landing page" --due 7d [--email billing@acme.com] [--token USDT|USDC]',
  },
  watch: {
    run: cmdWatch,
    options: {
      loop: { type: 'boolean' },
      interval: { type: 'string' },
      scenario: { type: 'string' },
      'pay-on': { type: 'string' },
    },
    help: 'watch [--loop] [--interval 15] [--scenario full|partial|over] [--pay-on 3]',
  },
  remind: { run: cmdRemind, options: {}, help: 'remind' },
  list: { run: cmdList, options: { json: { type: 'boolean' } }, help: 'list [--json]' },
};

function printHelp() {
  console.log(`
  ${c.bold(`${sym.bolt} PaidFast`)} — invoice in crypto, get paid without chasing.  ${c.dim(`mode: ${MODE}`)}

  ${c.bold('Commands')}
    ${c.cyan('create')}   ${COMMANDS.create.help}
             ${c.dim('→ invoice record + HTML invoice (out/invoices/) + invoice email')}
    ${c.cyan('watch')}    ${COMMANDS.watch.help}
             ${c.dim('→ checks X Layer for payments; on PAID: receipt to both parties + sweep')}
    ${c.cyan('remind')}   ${COMMANDS.remind.help}
             ${c.dim('→ due−2d gentle · due-day firmer · due+3d escalation (never double-sends)')}
    ${c.cyan('list')}     ${COMMANDS.list.help}

  ${c.bold('Environment')}
    OKX_MODE=mock|real          adapters mode (default mock — runs with zero credentials)
    PAIDFAST_NOW=<ISO date>     time-travel for testing reminder stages
    PAIDFAST_OWNER_NAME/EMAIL   who invoices come from
    PAIDFAST_MOCK_SCENARIO      full|partial|over · PAIDFAST_MOCK_PAY_ON=<n>

  ${c.bold('Demo')}
    npm run demo   ${c.dim('scripted lifecycle: create → watch ×2 → reminder → payment → receipt+sweep')}
`);
}

async function main() {
  const [cmdName, ...rest] = process.argv.slice(2);

  if (!cmdName || ['help', '--help', '-h'].includes(cmdName)) {
    printHelp();
    return;
  }

  const command = COMMANDS[cmdName];
  if (!command) {
    console.error(`\n  ${c.red(`${sym.fail} unknown command "${cmdName}"`)}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  let values;
  try {
    ({ values } = parseArgs({ args: rest, options: command.options, allowPositionals: false }));
  } catch (err) {
    throw new UsageError(`${err.message}\n  usage: node src/index.js ${command.help}`);
  }

  await command.run(values);
}

main().catch((err) => {
  if (err instanceof UsageError) {
    console.error(`\n  ${c.red(`${sym.fail} ${err.message}`)}\n`);
  } else if (err instanceof NotConfiguredError) {
    console.error(`\n  ${c.red(`${sym.fail} ${err.message}`)} ${c.dim(`[mode: ${MODE}]`)}`);
    for (const hint of err.hints) console.error(`    ${c.dim(hint)}`);
    console.error(`\n  ${c.dim('Tip: everything runs end-to-end with OKX_MODE=mock (the default).')}\n`);
  } else {
    console.error(`\n  ${c.red(`${sym.fail} ${err.stack || err.message}`)}\n`);
  }
  process.exitCode = 1;
});
