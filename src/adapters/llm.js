// LLM copy adapter — all client-facing email copy comes through here.
//
// MOCK MODE (default): carefully written canned templates, interpolated with
// invoice facts. They are the product's voice: polite, human, effective.
//
// REAL MODE — STUB (no API key yet). Intended wiring, per current Claude API:
//
//   npm i @anthropic-ai/sdk            // env: ANTHROPIC_API_KEY
//
//   import Anthropic from '@anthropic-ai/sdk';
//   const client = new Anthropic();
//   const response = await client.messages.create({
//     model: 'claude-opus-4-8',
//     max_tokens: 1024,
//     system:
//       'You write payment-collection emails for a freelancer. Warm, human, ' +
//       'concise, never passive-aggressive. Escalate firmness with the stage ' +
//       'but always leave the client a graceful way to fix it. Include the ' +
//       'payment details block verbatim. Never invent facts.',
//     // Guarantee { subject, body } shape with structured outputs:
//     output_config: { format: { type: 'json_schema', schema: {
//       type: 'object',
//       properties: { subject: { type: 'string' }, body: { type: 'string' } },
//       required: ['subject', 'body'], additionalProperties: false,
//     } } },
//     messages: [{ role: 'user', content: JSON.stringify({ stage, facts }) }],
//   });
//   const { subject, body } = JSON.parse(
//     response.content.find((b) => b.type === 'text').text,
//   );
//
// Design decision: if the real LLM call ever fails, FALL BACK to these mock
// templates rather than blocking the collections loop — a slightly less
// bespoke reminder beats a reminder that never sends.

import { MODE } from '../config.js';

/**
 * @param {'invoice'|'gentle'|'due'|'escalation'|'receipt-client'|'receipt-owner'} kind
 * @param {object} f  invoice facts (see buildFacts in src/facts.js)
 * @returns {Promise<{subject: string, text: string}>}
 */
export async function generateEmailCopy(kind, f) {
  if (MODE === 'real') {
    // STUB: see wiring notes in the file header. Deliberate graceful fallback:
    console.warn('[llm] real mode not wired (ANTHROPIC_API_KEY); using built-in templates.');
  }
  const template = TEMPLATES[kind];
  if (!template) throw new Error(`Unknown email copy kind "${kind}"`);
  return template(f);
}

/* ----------------------------------------------------------- the voice */

const TEMPLATES = {
  /** Fresh invoice, sent the moment it's created. */
  invoice: (f) => ({
    subject: `Invoice ${f.invoiceId} from ${f.ownerName} — ${f.amountDue} ${f.token}, due ${f.dueHuman}`,
    text: `Hi ${f.clientFirstName},

Thanks again for the work on ${f.description} — invoice ${f.invoiceId} is attached.

  Amount   ${f.amountDue} ${f.token}
  Due      ${f.dueHuman}

Paying takes about a minute from OKX or any wallet that supports ${f.token} on X Layer:

${f.paymentBlock}

The deposit address is unique to this invoice, so your payment is matched — and your receipt sent — automatically, usually within a minute of the transfer landing.

If anything looks off, just reply to this email.

Best,
${f.ownerName}`,
  }),

  /** T minus 2 days: friendly heads-up. Zero pressure. */
  gentle: (f) => ({
    subject: `Heads-up: invoice ${f.invoiceId} is ${f.duePhrase}`,
    text: `Hi ${f.clientFirstName},

Hope the ${f.description} is treating you well. A quick heads-up that invoice ${f.invoiceId} (${f.amountDue} ${f.token}) is ${f.duePhrase} — ${f.dueHuman}.${f.isPartial ? `

Thanks for the ${f.amountPaid} ${f.token} you've already sent — just the remaining ${f.remaining} ${f.token} to go.` : ''}

Everything you need is below (and on the attached invoice). The transfer usually settles on X Layer in under a minute, and your receipt is sent automatically.

${f.paymentBlock}

If it's already on its way — wonderful, please ignore me. And if the timing is awkward this week, just say so; I'd rather know than wonder.

Best,
${f.ownerName}`,
  }),

  /** Day-of: courteous but unambiguous. Opens the door to problems. */
  due: (f) => ({
    subject: `Invoice ${f.invoiceId} is due today (${f.amountDue} ${f.token})`,
    text: `Hi ${f.clientFirstName},

A friendly note that invoice ${f.invoiceId} for ${f.amountDue} ${f.token} is due today, ${f.dueHuman}.${f.isPartial ? `

You've already covered ${f.amountPaid} ${f.token} of it — thank you. The remaining balance is ${f.remaining} ${f.token}.` : ''}

Payment details, for convenience:

${f.paymentBlock}

It settles in about a minute on X Layer, and the receipt goes out automatically the moment it lands — nothing else for you to do.

If there's an issue with the invoice, or this week is simply tight, reply and tell me — I'm easy to work with on timing when I know what's going on.

Thanks,
${f.ownerName}`,
  }),

  /**
   * T plus 3 days: professional escalation. Direct, respectful, specific ask
   * with a deadline and a plainly-stated consequence. No threats, no lawyers.
   */
  escalation: (f) => ({
    subject: `Overdue: invoice ${f.invoiceId} — ${f.daysOverdue} days past due`,
    text: `Hi ${f.clientFirstName},

Following up on invoice ${f.invoiceId} for ${f.amountDue} ${f.token}, which was due ${f.dueHuman} and is now ${f.daysOverdue} days past due.${f.isPartial ? ` (${f.amountPaid} ${f.token} received so far — ${f.remaining} ${f.token} outstanding.)` : ''}

I know invoices slip through the cracks — if that's all this is, here's everything needed; it takes about a minute to settle:

${f.paymentBlock}

If something is wrong with the invoice, or cash flow is the issue, tell me and we'll work out a plan — I'd genuinely rather solve it together.

Otherwise, I need either the payment or a firm payment date from you by ${f.graceDeadlineHuman}. Until the account is settled I'll be pausing further work on ${f.description}, which I'd much rather not do.

Thanks for taking care of this,
${f.ownerName}`,
  }),

  /** Receipt to the client the moment the chain confirms payment. */
  'receipt-client': (f) => ({
    subject: `Receipt: invoice ${f.invoiceId} is paid — thank you!`,
    text: `Hi ${f.clientFirstName},

Your payment for invoice ${f.invoiceId} just landed on X Layer — thank you!

  Received   ${f.amountPaid} ${f.token}
  Invoice    ${f.invoiceId}  (ref ${f.reference})
  Status     PAID${f.overpaid ? `

Small note: the amount received is ${f.overpaidBy} ${f.token} more than the invoice total. ${f.ownerName} has been flagged and will credit or return the difference — you don't need to do anything.` : ''}

The full receipt is attached for your records. It was a pleasure working with you on ${f.description} — anytime you're ready for the next thing, you know where to find me.

${f.ownerName}`,
  }),

  /** "You got paid" note to the freelancer. */
  'receipt-owner': (f) => ({
    subject: `${f.clientName} paid invoice ${f.invoiceId} (${f.amountPaid} ${f.token})`,
    text: `Good news — ${f.clientName} just paid invoice ${f.invoiceId}.

  Received   ${f.amountPaid} ${f.token} on X Layer
  Tx         ${f.lastTxHash}
  Invoice    ${f.invoiceId}  (ref ${f.reference})${f.overpaid ? `

  FLAG: overpaid by ${f.overpaidBy} ${f.token} — consider crediting or refunding.` : ''}

Receipt sent to ${f.clientName}. Sweep-to-stables step has been queued.

— PaidFast`,
  }),
};
