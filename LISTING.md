# OKX.AI Listing Manifest — PaidFast

The submission record for listing this agent on OKX.AI. Listing is an **on-chain
identity + service registration on X Layer** via the Onchain OS CLI — not a web
form. Fill the two `REPLACE_*` placeholders, then run the command sequence below.

## Canonical manifest

```json
{
  "role": "asp",
  "identity": {
    "name": "PaidFast",
    "description": "PaidFast is a crypto invoicing agent for freelancers. Tell it who to bill and how much; it issues a professional invoice with a unique X Layer payment address, watches the chain for payment (exact, partial or over), chases politely on a reminder schedule, and sends receipts to both parties when paid. You do the work — PaidFast does the chasing.",
    "avatar_file": "./brand/avatar.png",
    "preferred_language": "en"
  },
  "services": [
    {
      "name": "Freelance Crypto Invoicing",
      "description": "Creates a branded invoice with a unique X Layer USDT address, detects on-chain payment (exact, partial or over), sends staged polite reminders on unpaid invoices, and issues receipts on settlement. You supply: client name, amount, due date and your receiving wallet; optionally a client email for delivery. Hands-free collections.",
      "type": "A2MCP",
      "fee": "1",
      "fee_currency": "USDT",
      "endpoint": "https://REPLACE_WITH_YOUR_DEPLOY_HOST/api/invoices"
    }
  ]
}
```

- **`REPLACE_WITH_YOUR_DEPLOY_HOST`** → your deployed domain. The local route is
  `POST /api/invoices` (see [STATUS.md](STATUS.md)); must be a public `https://`
  URL (permanent on-chain).
- **`avatar.png`** → required uploaded image. Friendly fintech identity: violet
  lightning-bolt / paper-plane motif on white. Put it at `brand/avatar.png`.
- **fee** `"1"` = 1 USDT per invoice issued. Adjust freely (a small % is also
  reasonable); digits only, ≤6 decimals, currency is USDT.
- X Layer payment rail: chain **196**, USDT `0x779ded0c9e1022225f8e0630b35a9b54be713736`
  (6 decimals), gas-free. Preferred detection is `onchainos payment a2a-pay` /
  `wallet history` (direction=="receive"); see [STATUS.md](STATUS.md).

## Registration command sequence

```bash
# 0. Wallet session (TEE) — identities live on X Layer only, never pass --chain
onchainos wallet status --format json
onchainos wallet login <your-email>        # then: onchainos wallet verify <code>

# 1. Consent / eligibility (one ASP identity per wallet)
onchainos agent pre-check --role asp

# 2. Upload the avatar, capture the returned URL for --picture
onchainos agent upload --file ./brand/avatar.png

# 3. Automated listing QA — fix any findings before create
onchainos agent validate-listing --role asp \
  --name "PaidFast" \
  --description "PaidFast is a crypto invoicing agent for freelancers. Tell it who to bill and how much; it issues a professional invoice with a unique X Layer payment address, watches the chain for payment (exact, partial or over), chases politely on a reminder schedule, and sends receipts to both parties when paid. You do the work — PaidFast does the chasing." \
  --service '[{"name":"Freelance Crypto Invoicing","description":"Creates a branded invoice with a unique X Layer USDT address, detects on-chain payment (exact, partial or over), sends staged polite reminders on unpaid invoices, and issues receipts on settlement. You supply: client name, amount, due date and your receiving wallet; optionally a client email for delivery. Hands-free collections.","type":"A2MCP","fee":"1","endpoint":"https://REPLACE_WITH_YOUR_DEPLOY_HOST/api/invoices"}]'

# 4. Create the on-chain identity → returns newAgentId
onchainos agent create --role asp \
  --name "PaidFast" \
  --description "<same description as above>" \
  --picture "<url from step 2>" \
  --service '<same --service JSON as above>'

# 5. Activate → submits for review / publishes
onchainos agent activate --agent-id <newAgentId> --preferred-language en
```

On-chain fees are covered by OKX (X Layer is gas-free). Settlement is in USDT.

## Owner values — REGISTERED (Jul 3, 2026)

| Field | Value |
|---|---|
| **Agent ID** | **3618** (X Layer, chain 196) |
| Registration tx | `0xafcab336f39c5ee100d9209d060da019d1d8bc50f41aeafbceb651a8af5afefd` |
| Status | **submitted for review** (`approvalStatus: 2`); result → owner email within ~2 business days; usable via Agent ID meanwhile |
| Owner email / wallet login | macroid16@gmail.com |
| Payout wallet (X Layer, `X402_PAY_TO`) | `0x1e0516223a85e685e0ba30c6b6a118d408973698` |
| Avatar (uploaded) | `https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/6965d81a-29c1-484a-a7d9-9b9620c7a0fa.png` |
| Endpoint (on-chain, permanent) | `https://paidfast-production.up.railway.app/api/invoices` — passes `agent x402-check` (`valid: true`) |
| Repo | github.com/bigmac604/paidfast |
| Service | Freelance Crypto Invoicing, A2MCP, 1 USDT/call |

**Registration schema (learned from the first listing — use exactly):**
- `--service` keys are camelCase: `serviceName`, `serviceDescription`, `serviceType`, `fee`, `endpoint`
- `serviceDescription` must be TWO lines: capability summary, `\n`, then what the user supplies
- Endpoint must pass `onchainos agent x402-check` (the x402 v2 gate is already fixed in this repo)

## Owner checklist

- [x] x402 pay-per-call layer built on `POST /api/invoices` (HTTP 402 handshake,
      1 USDT fee = the listed A2MCP price) — **mock verified** end-to-end
      (`npm run x402-demo`, `X402_MODE=mock`). Real mode needs `X402_PAY_TO` +
      `OKX_X402_API_KEY/SECRET/PASSPHRASE` (creds pending; facilitator endpoint +
      auth header names flagged as assumed in STATUS.md). Note: this fee is what
      the *freelancer* pays per invoice issued — the invoice itself is paid by
      their client on X Layer, a separate rail.
- [ ] Deploy the service; set the real `https://` endpoint (replace the placeholder)
- [x] Create `brand/avatar.png` — done (1024×1024, violet coin with paper-plane + lightning bolt; editable source at `brand/avatar.svg`)
- [ ] Register hackathon + OKX Onchain OS dev-portal creds (`.env`); create + fund
      the X Layer receiving wallet
- [ ] Run steps 0-5 above; record `newAgentId`
- [ ] Confirm activation status (submitApproval → under review)
- [ ] Submit the hackathon Google form before **Jul 17 00:00 UTC**
- [ ] Post the ≤90s demo on X with **#okxai**
