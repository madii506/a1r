# A1R · the airdrop they promised us

Every coin we launch drops a slice to the holders of $A1R and of our other coins. Hold longer, get more. Nothing to claim.

## How it works
- **Snapshot:** every 10 minutes (when anyone visits, plus a daily cron) the API reads every holder of $A1R and of the fleet coins straight from the token programs. Pools, bonding curves (owners off the curve), the operator and the tag address are left out. Wallets need at least 0.01% of a coin's supply.
- **Clock:** each wallet has a clock per coin, from 1x to 3x over 14 days. Selling more than 2% resets it. Buying more never does.
- **Weight:** `share of $A1R × clock + 0.25 × Σ (share of each fleet coin × its clock)`.
- **Drop:** the operator builds a drop (SOL or a coin it holds) in the cockpit. It is split by weight across up to 400 wallets, and slices under the minimum roll over. The operator signs the batches in its own wallet. Every batch carries the memo `a1r:drop:<id>:<kind>:<mint>:<k>/<n>` and a 0-lamport touch on the tag address.
- **Proof:** `GET /api/a1r?a=verify&id=<id>` re-reads every batch from the chain.
- **Recovery:** `resume` first finds batches that already landed on-chain, then rebuilds only the missing ones. Nothing is paid twice.
- **Launch:** the cockpit can launch a coin on pump.fun (create + dev buy, one signature). The coin joins the fleet, and its dev buy is cargo for a drop.

## Environment (Vercel)
| var | what |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store (public), created in Storage |
| `A1R_MINT` | the $A1R mint, once launched |
| `A1R_OPERATOR` | the operator wallet: it signs drops, launches and claims |
| `RPC_URL` | optional, a dedicated RPC (recommended for snapshots of big coins) |

The site reads `api/a1r-config.json` for the rules and the tag address.

## API
GET `status · snap · holders · wallet&w= · drops · drop&id= · verify&id= · coins · holdings&w= · hold · chain`
POST `plan · send · landed · resume · scrub · claim · fleet · launch · snapnow · buildLaunch · launched`

Every write that changes state needs either an operator-signed message (`a1r: <action> <id> at <ms>`) or a confirmed on-chain transaction signed by the operator.

## Local
`node dev/test.cjs` runs the engine end to end against a fake chain (68 checks). `node dev/server.cjs` serves the site on the fake chain with labelled test data.

Not affiliated with pump.fun. Nothing here is financial advice.
