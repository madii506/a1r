// A1R API: the airdrop they promised us. Every coin we launch drops a slice to the holders of $A1R and of our other coins,
// shared by size × time held. Holders are read straight from the chain, every drop is a batch of transfers the operator signs in their
// own wallet, and every batch carries a memo and touches the A1R tag address, so the chain itself is the ledger.
// GET  a=status · a=snap · a=holders · a=wallet&w= · a=drops · a=drop&id= · a=coins · a=holdings&w= · a=chain
// POST a=plan · a=send · a=landed · a=claim · a=fleet · a=launch
const { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } = require('@solana/web3.js');
const SPL = require('@solana/spl-token');
const crypto = require('crypto');
const CFG = require('./a1r-config.json'), RU = CFG.rules;

// ---------------------------------------------------------------- plumbing
const RPCS = [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
async function rpcFetch(url, opts) { let last = null; for (let round = 0; round < 2; round++) { for (const u of RPCS) { try { const r = await fetch(u, { ...opts, signal: AbortSignal.timeout(20000) }); if (r.status === 429 || r.status === 401 || r.status === 403 || r.status >= 500) { last = r; continue; } return r; } catch (e) { last = e; } } await new Promise(r => setTimeout(r, 700)); } if (last instanceof Error) throw last; return last; }
const conn = new Connection(RPCS[0], { commitment: 'confirmed', fetch: rpcFetch, disableRetryOnRateLimit: true });
const TOKEN = SPL.TOKEN_PROGRAM_ID, T22 = SPL.TOKEN_2022_PROGRAM_ID, MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const SOL = 'So11111111111111111111111111111111111111112', JUP = 'https://lite-api.jup.ag', PFX = 'a1r/';
const okKey = s => { try { return s ? new PublicKey(String(s).trim()).toBase58() : null; } catch { return null; } };
const MINT = () => okKey(process.env.A1R_MINT) || okKey(CFG.mint);
const OPERATOR = () => okKey(process.env.A1R_OPERATOR) || okKey(CFG.operator);
const TAG = new PublicKey(process.env.A1R_TAG || CFG.tag);

const out = (res, code, b, cache) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', cache || 'no-store'); res.end(JSON.stringify(b)); };
const body = req => new Promise(ok => { if (req.body) return ok(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); let d = ''; req.on('data', c => d += c); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const pk = (s, what) => { try { return new PublicKey(String(s).trim()); } catch { throw new Error(what || 'that is not a Solana address'); } };
async function getJ(url, ms = 8000) { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(r.status + ' ' + url.split('/')[2]); return r.json(); }
const cache = new Map();
async function memo(key, ttl, fn) { const c = cache.get(key); if (c && Date.now() - c.t < ttl) return c.v; if (c && c.p) return c.p; const p = fn().then(v => { cache.set(key, { t: Date.now(), v }); return v; }, e => { if (c) cache.set(key, c); else cache.delete(key); throw e; }); cache.set(key, { ...(c || { t: 0 }), p }); return p; }
const forget = k => cache.delete(k);
// parsed transactions, read 10 at a time so public RPCs don't throttle us
async function parsedTxs(sigs) { const out = []; for (let i = 0; i < sigs.length; i += 10) { out.push(...await conn.getParsedTransactions(sigs.slice(i, i + 10), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })); if (i + 10 < sigs.length) await new Promise(r => setTimeout(r, 150)); } return out; }
const memoIx = text => new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(text) });
const tagIx = from => SystemProgram.transfer({ fromPubkey: from, toPubkey: TAG, lamports: 0 });
const fits = t => { try { return t.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= 1232; } catch { return false; } };

// ---------------------------------------------------------------- storage: a few small JSON files in Vercel Blob
const blob = () => require('@vercel/blob');
const hasStore = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const blobBase = () => { const id = (process.env.BLOB_STORE_ID || '').replace(/^store_/, '') || String(process.env.BLOB_READ_WRITE_TOKEN || '').split('_')[3] || ''; return id ? `https://${id.toLowerCase()}.public.blob.vercel-storage.com/` : null; };
async function putJSON(path, v) { if (!hasStore()) throw new Error('storage is not switched on yet'); await blob().put(PFX + path, JSON.stringify(v), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 }); forget('f:' + path); return v; }
async function readJSON(path, fresh) { const b = blobBase(); if (!b) return null; const go = async () => { try { const r = await fetch(b + PFX + path + '?t=' + (fresh ? Date.now() : Math.floor(Date.now() / 15000)), { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch { return null; } }; return fresh ? go() : memo('f:' + path, 10000, go); }

// ---------------------------------------------------------------- token info
async function jupInfo(mints) { const o = {}, L = [...new Set(mints)].filter(Boolean);
  for (let i = 0; i < L.length; i += 90) { try { const j = await getJ(`${JUP}/tokens/v2/search?query=${L.slice(i, i + 90).join(',')}`);
    for (const t of j || []) { const s = t.stats24h || {}; o[t.id] = { symbol: t.symbol, name: t.name, icon: t.icon || null, decimals: t.decimals, usd: t.usdPrice ?? null, ch24: s.priceChange ?? null, mcap: t.mcap ?? t.fdv ?? null, holders: t.holderCount ?? null, vol24: (s.buyVolume || 0) + (s.sellVolume || 0), launchpad: t.launchpad || null, graduated: !!t.graduatedPool }; } } catch { } }
  return o; }
const solUsd = () => memo('solusd', 30000, async () => ((await jupInfo([SOL]))[SOL] || {}).usd || null);
async function mintInfo(mint) { return memo('mint:' + mint, 3600e3, async () => { const a = await conn.getAccountInfo(new PublicKey(mint)); if (!a) throw new Error('that mint does not exist'); const d = a.data;
  return { program: a.owner.toBase58(), decimals: d[44], supply: d.readBigUInt64LE(36).toString() }; }); }

// ---------------------------------------------------------------- the fleet: $A1R, and the coins we built before it
async function fleet() { const saved = (await readJSON('fleet.json')) || []; const L = [...(CFG.fleet || []), ...saved].filter(f => okKey(f.mint) && f.mint !== MINT()); const seen = new Set(); return L.filter(f => !seen.has(f.mint) && seen.add(f.mint)); }
// every wallet holding a mint, read straight from the token program; pools and bonding curves (owners off the curve) are left out
async function holdersOf(mint) { const mi = await mintInfo(mint), prog = new PublicKey(mi.program), filters = [{ memcmp: { offset: 0, bytes: mint } }]; if (mi.program === TOKEN.toBase58()) filters.push({ dataSize: 165 });
  const accs = await conn.getProgramAccounts(prog, { filters, dataSlice: { offset: 32, length: 40 }, encoding: 'base64' }), map = new Map(), skip = new Set([OPERATOR(), TAG.toBase58()].filter(Boolean));
  for (const a of accs) { const d = a.account.data, b = Buffer.isBuffer(d) ? d : Array.isArray(d) ? Buffer.from(d[0], 'base64') : Buffer.from(d); if (b.length < 40) continue; const amt = b.readBigUInt64LE(32); if (amt === 0n) continue; const ob = b.subarray(0, 32);
    if (!PublicKey.isOnCurve(ob)) continue; const o = new PublicKey(ob).toBase58(); if (skip.has(o)) continue; map.set(o, (map.get(o) || 0n) + amt); }
  return { ...mi, map }; }
const multOf = (since, now) => 1 + (RU.maxMult - 1) * Math.min(1, Math.max(0, now - since) / (RU.multDays * 86400e3));

// ---------------------------------------------------------------- the snapshot: who holds what, since when, and what that weighs
async function snapshot(force) {
  const prev = await readJSON('snap.json', true), lock = await readJSON('lock.json', true), now = Date.now();
  if (!force && prev && now - prev.at < RU.snapEveryMin * 60e3) return prev;
  if (lock && now - lock.at < 90e3) return prev || { at: 0, list: [], mints: [], busy: true };
  await putJSON('lock.json', { at: now });
  try {
    const mints = [MINT(), ...(await fleet()).map(f => f.mint)].filter(Boolean), clocks = (await readJSON('clocks.json', true)) || {}, per = new Map(), meta = [];
    for (const mint of mints) { let h; try { h = await holdersOf(mint); } catch (e) { meta.push({ mint, error: String(e.message || e).slice(0, 120) }); continue; }
      const ck = clocks[mint] || {}, next = {}, sup = Number(h.supply) || 1;
      for (const [w, bal] of h.map) { const p = ck[w]; let since = p ? p.s : now; if (p && bal * 100n < BigInt(p.b) * BigInt(Math.round(RU.sellReset * 100))) since = now;   // sold: the clock starts again
        next[w] = { b: bal.toString(), s: since }; const e = per.get(w) || {}; e[mint] = { share: Number(bal) / sup, since, ui: Number(bal) / 10 ** h.decimals }; per.set(w, e); }
      clocks[mint] = next; meta.push({ mint, holders: h.map.size, supply: h.supply, decimals: h.decimals }); }
    const A = MINT(), F = mints.filter(m => m !== A), list = [];
    for (const [w, e] of per) { const a = A && e[A], am = a ? multOf(a.since, now) : 0, aw = a ? a.share * am : 0; let fw = 0, best = a ? a.share : 0;
      for (const m of F) if (e[m]) { fw += e[m].share * multOf(e[m].since, now) * RU.fleetWeight; best = Math.max(best, e[m].share); }
      if (best < RU.minHoldPct / 100) continue;
      list.push({ w, wt: aw + fw, a: a ? { ui: a.ui, sh: a.share, since: a.since, m: +am.toFixed(3) } : null, f: Object.fromEntries(F.filter(m => e[m]).map(m => [m, { ui: e[m].ui, sh: e[m].share, since: e[m].since, m: +multOf(e[m].since, now).toFixed(3) }])) }); }
    const total = list.reduce((s, x) => s + x.wt, 0); list.sort((x, y) => y.wt - x.wt); list.forEach((x, i) => { x.rank = i + 1; x.pct = total ? x.wt / total : 0; });
    const snap = { at: now, mints: meta, total, eligible: list.length, holders: per.size, list: list.slice(0, 3000) };
    await putJSON('clocks.json', clocks); await putJSON('snap.json', snap); return snap;
  } finally { await putJSON('lock.json', { at: 0 }).catch(() => { }); }
}

// ---------------------------------------------------------------- drops: a plan, its batches, and the proof it landed
const dropIndex = async () => (await readJSON('drops.json')) || [];
function batchTx(D, k, n, part) { const { id, kind, mint, decimals, program, opPk, bh } = D, t = new Transaction({ feePayer: opPk, recentBlockhash: bh });
  t.add(ComputeBudgetProgram.setComputeUnitLimit({ units: kind === 'sol' ? 60000 : 200000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
  if (kind === 'sol') for (const [w, v] of part) t.add(SystemProgram.transfer({ fromPubkey: opPk, toPubkey: new PublicKey(w), lamports: BigInt(v) }));
  else { const m = new PublicKey(mint), src = SPL.getAssociatedTokenAddressSync(m, opPk, false, program); for (const [w, v] of part) { const to = new PublicKey(w), dst = SPL.getAssociatedTokenAddressSync(m, to, false, program);
      t.add(SPL.createAssociatedTokenAccountIdempotentInstruction(opPk, dst, to, m, program), SPL.createTransferCheckedInstruction(src, m, dst, opPk, BigInt(v), decimals, [], program)); } }
  t.add(memoIx(`a1r:drop:${id}:${kind}:${mint || 'SOL'}:${k + 1}/${n}`), tagIx(opPk)); return t; }
// a drop that did not fully land: first recover any batch that did land (from the chain), then rebuild only the batches still missing
async function resume(b) { const op = OPERATOR(); if (!op || pk(b.from).toBase58() !== op) throw new Error('only the A1R operator wallet can resume a drop'); const id = clean(b.id, 40).replace(/[^a-z0-9]/g, '');
  let p = await readJSON(`plan/${id}.json`, true); if (!p) throw new Error('no such drop'); if (p.status === 'scrubbed') throw new Error('that drop was scrubbed');
  forget('chain'); const found = (await chain()).filter(r => r.memo.startsWith(`a1r:drop:${id}:`) && r.by === op).map(r => r.sig); if (found.length) { await landed({ id, sigs: found }).catch(() => { }); p = await readJSON(`plan/${id}.json`, true); }
  const sigs = p.sigs || [], todo = p.batches.map((_, k) => k).filter(k => !sigs[k]); if (!todo.length) return { id, txs: [], left: 0, status: p.status };
  const program = p.kind === 'token' ? new PublicKey((await mintInfo(p.mint)).program) : null, D = { id, kind: p.kind, mint: p.mint, decimals: p.decimals, program, opPk: new PublicKey(op), bh: (await conn.getLatestBlockhash('confirmed')).blockhash };
  return { id, left: todo.length, txs: todo.map(k => batchTx(D, k, p.batches.length, p.batches[k]).serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')) }; }
// check one flight against the chain: every batch signature must exist, have succeeded, be signed by the operator and carry this flight's memo
async function verify(id) { id = clean(id, 40).replace(/[^a-z0-9]/g, ''); return memo('v:' + id, 30000, async () => { const p = await readJSON(`plan/${id}.json`); if (!p) throw new Error('no such drop'); const sigs = p.sigs || [], have = sigs.map((s, k) => [s, k]).filter(x => x[0]);
  const txs = have.length ? await parsedTxs(have.map(x => x[0])) : [], res = p.batches.map(() => 'not sent');
  txs.forEach((t, i) => { const k = have[i][1]; if (!t || !t.meta) { res[k] = 'not found'; return; } if (t.meta.err) { res[k] = 'failed'; return; } if (t.transaction.message.accountKeys[0].pubkey.toBase58() !== p.from) { res[k] = 'wrong signer'; return; }
    res[k] = t.transaction.message.instructions.some(ix => ix.program === 'spl-memo' && ix.parsed === `a1r:drop:${id}:${p.kind}:${p.mint || 'SOL'}:${k + 1}/${p.batches.length}`) ? 'ok' : 'no memo'; });
  return { id, batches: res, ok: res.filter(x => x === 'ok').length, of: res.length }; }); }
async function scrub(b) { const id = signed(b, 'scrub', '[a-z0-9]{6,40}'); const p = await readJSON(`plan/${id}.json`, true); if (!p) throw new Error('no such drop'); if ((p.sigs || []).some(Boolean)) throw new Error('part of this drop already flew. resume it instead');
  p.status = 'scrubbed'; await putJSON(`plan/${id}.json`, p); const idx = await dropIndex(); const e = idx.find(x => x.id === id); if (e) { e.status = 'scrubbed'; await putJSON('drops.json', idx); } return { id, status: 'scrubbed' }; }
async function plan(b) {
  const op = OPERATOR(); if (!op) throw new Error('the operator wallet is not set yet'); const from = pk(b.from).toBase58(); if (from !== op) throw new Error('only the A1R operator wallet can build a drop');
  const kind = b.kind === 'token' ? 'token' : 'sol', amount = +b.amount; if (!(amount > 0)) throw new Error('how much should drop?');
  const snap = await readJSON('snap.json', true); if (!snap || !snap.list.length) throw new Error('no snapshot yet. take one first'); if (Date.now() - snap.at > 6 * 3600e3) throw new Error('the snapshot is older than 6 hours. take a fresh one first');
  let mint = null, decimals = 9, program = null, raw;
  if (kind === 'token') { mint = pk(b.mint, 'which coin should drop?').toBase58(); const mi = await mintInfo(mint); decimals = mi.decimals; program = new PublicKey(mi.program);
    raw = BigInt(Math.floor(amount * 10 ** Math.min(decimals, 9))) * 10n ** BigInt(Math.max(0, decimals - 9));
    const ata = SPL.getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(op), false, program); const bal = await conn.getTokenAccountBalance(ata).catch(() => null);
    if (!bal || BigInt(bal.value.amount) < raw) throw new Error(`the operator holds ${bal ? bal.value.uiAmountString : 0} of that coin, less than the drop`); }
  else { raw = BigInt(Math.round(amount * 1e9)); const lam = await conn.getBalance(new PublicKey(op)); if (BigInt(lam) < raw + 20000000n) throw new Error(`the operator has ${(lam / 1e9).toFixed(4)} SOL, not enough for this drop and its fees`); }
  // who gets what: the heaviest wallets first, shares under the minimum roll over to the next drop
  let rec = snap.list.slice(0, RU.maxRecipients), skipped = snap.list.length - rec.length;
  const minRaw = kind === 'sol' ? BigInt(Math.round(RU.minSol * 1e9)) : raw * BigInt(Math.round(RU.minTokenShare * 1e6)) / 1000000n;
  for (let pass = 0; pass < 4; pass++) { const tw = rec.reduce((s, x) => s + x.wt, 0); const keep = rec.filter(x => BigInt(Math.floor(Number(raw) * x.wt / tw)) >= (minRaw || 1n)); skipped += rec.length - keep.length; if (keep.length === rec.length) break; rec = keep; }
  if (!rec.length) throw new Error('the drop is too small to reach anyone. make it bigger');
  if (kind === 'token') { const lam = await conn.getBalance(new PublicKey(op)), need = rec.length * 2100000 + 20000000; if (lam < need) throw new Error(`a coin drop to ${rec.length} wallets can need up to ${(need / 1e9).toFixed(3)} SOL for token accounts; the operator has ${(lam / 1e9).toFixed(3)} SOL`); }
  const tw = rec.reduce((s, x) => s + x.wt, 0); let given = 0n; const shares = rec.map(x => { const v = BigInt(Math.floor(Number(raw) * x.wt / tw)); given += v; return [x.w, v]; }); shares[0][1] += raw - given;   // the rounding dust goes to the heaviest wallet
  const id = Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), opPk = new PublicKey(op), per = kind === 'sol' ? 18 : 6, batches = [];
  for (let i = 0; i < shares.length; i += per) batches.push(shares.slice(i, i + per));
  const bh = (await conn.getLatestBlockhash('confirmed')).blockhash, D = { id, kind, mint, decimals, program, opPk, bh };
  for (let k = 0; k < batches.length; k++) { const part = batches[k]; while (!fits(batchTx(D, k, 999, part)) && part.length > 1) { const spill = part.pop(); if (k + 1 < batches.length) batches[k + 1].unshift(spill); else batches.push([spill]); } }
  const txs = batches.map((part, k) => batchTx(D, k, batches.length, part).serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')), plan = batches.map(part => part.map(([w, v]) => [w, v.toString()]));
  const rec2 = { id, kind, mint, decimals, amount: raw.toString(), from: op, at: Date.now(), snapAt: snap.at, batches: plan, wallets: shares.length, skipped, status: 'boarding' };
  await putJSON(`plan/${id}.json`, rec2);
  const idx = await dropIndex(); idx.unshift({ id, kind, mint, amount: raw.toString(), decimals, wallets: shares.length, at: rec2.at, status: 'boarding' }); await putJSON('drops.json', idx.slice(0, 500));
  return { id, txs, wallets: shares.length, skipped, batches: plan.length };
}
async function landed(b) {
  const id = clean(b.id, 40).replace(/[^a-z0-9]/g, ''), p = await readJSON(`plan/${id}.json`, true); if (!p) throw new Error('no such drop');
  const sigs = [...new Set((Array.isArray(b.sigs) ? b.sigs : []).map(s => clean(s, 100)).filter(Boolean))].slice(0, 120); if (!sigs.length) throw new Error('no signatures');
  const txs = await parsedTxs(sigs), got = {};
  txs.forEach((t, i) => { if (!t || !t.meta || t.meta.err) return; if (t.transaction.message.accountKeys[0].pubkey.toBase58() !== p.from) return;
    for (const ix of t.transaction.message.instructions) { if (ix.program !== 'spl-memo' || typeof ix.parsed !== 'string') continue; const m = new RegExp(`^a1r:drop:${id}:\\w+:\\w+:(\\d+)/(\\d+)$`).exec(ix.parsed); if (m) got[+m[1] - 1] = sigs[i]; } });
  const done = Object.keys(got).map(Number); if (!done.length) throw new Error('none of those transactions are batches of this drop (yet). wait a few seconds and try again');
  const recv = (await readJSON('recv.json', true)) || {}, prevDone = new Set((p.sigs || []).map((s, k) => s ? k : -1).filter(k => k >= 0)); p.sigs = p.sigs || [];
  for (const k of done) { if (prevDone.has(k)) continue; p.sigs[k] = got[k]; for (const [w, v] of p.batches[k]) { const r = recv[w] || (recv[w] = { sol: 0, tok: {}, drops: [] }); const ui = Number(BigInt(v)) / 10 ** p.decimals;
      if (p.kind === 'sol') r.sol += ui; else r.tok[p.mint] = (r.tok[p.mint] || 0) + ui; if (!r.drops.includes(p.id)) r.drops.push(p.id); } }
  const n = p.sigs.filter(Boolean).length; p.status = n === p.batches.length ? 'landed' : 'in flight'; p.landedAt = Date.now();
  await putJSON(`plan/${id}.json`, p); await putJSON('recv.json', recv);
  const idx = await dropIndex(); const e = idx.find(x => x.id === id); if (e) { e.status = p.status; e.landed = n; e.batches = p.batches.length; e.sig = p.sigs.find(Boolean); e.landedAt = p.landedAt; await putJSON('drops.json', idx); }
  return { id, status: p.status, landed: n, of: p.batches.length };
}

// ---------------------------------------------------------------- the operator's signed requests (fleet coins, launches)
const verifySig = (wallet, msg, sig) => { try { const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(new PublicKey(wallet).toBytes()).toString('base64url') }, format: 'jwk' }); return crypto.verify(null, Buffer.from(msg), key, Buffer.from(String(sig), 'base64')); } catch { return false; } };
function signed(b, what, idRe = '[1-9A-HJ-NP-Za-km-z]{32,44}') { const op = OPERATOR(); if (!op) throw new Error('the operator wallet is not set yet'); const msg = clean(b.msg, 300), m = new RegExp(`^a1r: ${what} (${idRe}) at (\\d{13})$`).exec(msg);
  if (!m) throw new Error('bad message'); if (Math.abs(Date.now() - +m[2]) > 10 * 60e3) throw new Error('that signature is too old. sign again'); if (!verifySig(op, msg, b.sig)) throw new Error('only the operator wallet can do that'); return m[1]; }

// ---------------------------------------------------------------- launching our coins on pump.fun from the cockpit: the dev buy is the cargo
async function buildLaunch(b) { const mintStr = signed(b, 'launch'), op = new PublicKey(OPERATOR()), mint = new PublicKey(mintStr);
  if (await conn.getAccountInfo(mint)) throw new Error('that mint already exists. generate a new one');
  const name = clean(b.name, 32), symbol = clean(b.symbol, 10).replace(/^\$/, '').toUpperCase(); if (!name || !symbol) throw new Error('a launch needs a name and a ticker');
  const dev = +b.devBuy; if (!(dev >= .01 && dev <= 20)) throw new Error('the dev buy must be between 0.01 and 20 SOL. it is the cargo for the drop');
  const m = /^data:(image\/(png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || '')); if (!m) throw new Error('add an image (png, jpg, gif or webp)');
  const img = Buffer.from(m[3], 'base64'); if (img.length > 1.5e6) throw new Error('the image is over 1.5 MB');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2], imgPath = `img/${crypto.createHash('sha256').update(img).digest('hex').slice(0, 24)}.${ext}`;
  if (!hasStore()) throw new Error('storage is not switched on yet'); const imgUrl = (await blob().put(PFX + imgPath, img, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: m[1], cacheControlMaxAge: 31536000 })).url;
  const link = (v, re) => { v = clean(v, 200); return v && re.test(v) ? v : undefined; };
  const meta = { name, symbol, description: clean(b.description, 500), image: imgUrl, showName: true, createdOn: 'A1R', twitter: link(b.twitter, /^https:\/\/(x|twitter)\.com\//), website: link(b.website, /^https:\/\//) };
  const metaUrl = (await blob().put(PFX + `meta/${mintStr}.json`, JSON.stringify(meta), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 31536000 })).url;
  const SDK = require('@pump-fun/pump-sdk'), BN = require('bn.js'), online = new SDK.OnlinePumpSdk(conn), global = await online.fetchGlobal(), feeConfig = await online.fetchFeeConfig().catch(() => null);
  const solAmount = new BN(Math.round(dev * 1e9)), amount = SDK.getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: new PublicKey(SOL) });
  const ixs = await SDK.PUMP_SDK.createV2AndBuyInstructions({ global, mint, name, symbol, uri: metaUrl, creator: op, user: op, amount, solAmount: solAmount.muln(101).divn(100), mayhemMode: false });
  const t = new Transaction({ feePayer: op, recentBlockhash: (await conn.getLatestBlockhash('confirmed')).blockhash }); t.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }), ...ixs, memoIx(`a1r:launch:${mintStr}`), tagIx(op));
  let sim = null; if (b.simulate) { const { VersionedTransaction } = require('@solana/web3.js'); const r = await conn.simulateTransaction(new VersionedTransaction(t.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true }).catch(e => ({ value: { err: String(e.message || e) } })); sim = { err: r.value && r.value.err || null, logs: (r.value && r.value.logs || []).slice(-6) }; }
  return { mint: mintStr, meta: metaUrl, image: imgUrl, tokens: amount.toString(), txs: [t.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')], sim }; }
async function launched(b) { const op = OPERATOR(), mint = pk(b.mint).toBase58(), sig = clean(b.sig, 100); const [t] = await parsedTxs([sig]);
  if (!t || !t.meta || t.meta.err) throw new Error('that launch is not confirmed yet. wait a few seconds'); if (t.transaction.message.accountKeys[0].pubkey.toBase58() !== op) throw new Error('that launch was not signed by the operator');
  if (!t.transaction.message.instructions.some(ix => ix.program === 'spl-memo' && ix.parsed === `a1r:launch:${mint}`)) throw new Error('that transaction is not an A1R launch');
  const info = (await jupInfo([mint]))[mint] || {}, meta = await readJSON(`meta/${mint}.json`, true) || {}; let L = (await readJSON('launches.json', true)) || []; L = L.filter(x => x.mint !== mint); L.unshift({ mint, name: meta.name || info.name || null, symbol: meta.symbol || info.symbol || null, at: Date.now(), sig }); await putJSON('launches.json', L.slice(0, 100));
  let F = (await readJSON('fleet.json', true)) || []; if (!F.some(f => f.mint === mint)) { F.push({ mint, name: meta.name || info.name || mint.slice(0, 4), symbol: meta.symbol || info.symbol || null, at: Date.now() }); await putJSON('fleet.json', F); }
  return { launches: L }; }

// ---------------------------------------------------------------- reads
async function status() { const [snap, idx, fl, ln] = await Promise.all([readJSON('snap.json'), dropIndex(), fleet(), readJSON('launches.json')]); const recv = (await readJSON('recv.json')) || {};
  const land = idx.filter(d => d.status === 'landed' || d.status === 'in flight'); const sol = Object.values(recv).reduce((s, r) => s + (r.sol || 0), 0);
  return { name: CFG.name, mint: MINT(), operator: OPERATOR(), tag: TAG.toBase58(), promised: CFG.promised, storage: hasStore(), rules: RU, snapAt: snap ? snap.at : null, holders: snap ? snap.holders : 0, eligible: snap ? snap.eligible : 0,
    drops: land.length, boarding: idx.filter(d => d.status === 'boarding').length, solDropped: +sol.toFixed(4), coinsDropped: new Set(land.filter(d => d.kind === 'token').map(d => d.mint)).size, walletsHit: Object.keys(recv).length,
    fleet: fl, launches: ln || [], live: !!(MINT() && OPERATOR() && hasStore()), test: !!process.env.A1R_TEST || undefined }; }
async function walletView(w) { const snap = await readJSON('snap.json'), recv = (await readJSON('recv.json')) || {}, e = snap && snap.list.find(x => x.w === w), r = recv[w] || { sol: 0, tok: {}, drops: [] };
  let live = null; if (!e) { const mints = [MINT(), ...(await fleet()).map(f => f.mint)].filter(Boolean); if (mints.length) { live = {}; for (const prog of [TOKEN, T22]) { const L = await conn.getParsedTokenAccountsByOwner(new PublicKey(w), { programId: prog }).catch(() => ({ value: [] }));
        for (const a of L.value) { const i = a.account.data.parsed.info; if (mints.includes(i.mint)) live[i.mint] = (live[i.mint] || 0) + +i.tokenAmount.uiAmountString; } } } }
  return { w, snapAt: snap ? snap.at : null, entry: e || null, eligibleCount: snap ? snap.eligible : 0, live, received: r }; }
async function coins() { const fl = await fleet(), A = MINT(), list = [...(A ? [{ mint: A, name: CFG.name, weight: 1, a1r: true }] : []), ...fl.map(f => ({ ...f, weight: RU.fleetWeight }))]; const info = await jupInfo(list.map(x => x.mint)); const snap = await readJSON('snap.json');
  return list.map(x => ({ ...x, ...(info[x.mint] || {}), snapHolders: snap ? ((snap.mints.find(m => m.mint === x.mint) || {}).holders ?? null) : null })); }
async function holdings(w) { const o = []; for (const prog of [TOKEN, T22]) { const L = await conn.getParsedTokenAccountsByOwner(new PublicKey(w), { programId: prog }); for (const a of L.value) { const i = a.account.data.parsed.info; if (+i.tokenAmount.amount > 0) o.push({ mint: i.mint, ui: +i.tokenAmount.uiAmountString, decimals: i.tokenAmount.decimals }); } }
  const info = await jupInfo(o.map(x => x.mint)); return { sol: (await conn.getBalance(new PublicKey(w))) / 1e9, tokens: o.map(x => ({ ...x, symbol: (info[x.mint] || {}).symbol || null, icon: (info[x.mint] || {}).icon || null, usd: (info[x.mint] || {}).usd ?? null })).sort((a, b) => (b.ui * (b.usd || 0)) - (a.ui * (a.usd || 0))) }; }
async function chain() { return memo('chain', 30000, async () => { const sigs = (await conn.getSignaturesForAddress(TAG, { limit: 200 })).filter(s => !s.err), rows = [];
  const txs = await parsedTxs(sigs.map(s => s.signature)).catch(() => []);
  txs.forEach((t, k) => { if (!t) return; for (const ix of t.transaction.message.instructions) if (ix.program === 'spl-memo' && typeof ix.parsed === 'string' && ix.parsed.startsWith('a1r:')) rows.push({ memo: ix.parsed, sig: sigs[k].signature, at: t.blockTime, by: t.transaction.message.accountKeys[0].pubkey.toBase58() }); });
  return rows; }); }
// the cargo in the hold: the dev buys of our launches still in the operator wallet, plus $A1R's unclaimed creator fees
async function hold() { return memo('hold', 30000, async () => { const op = OPERATOR(); if (!op) return { items: [], fees: 0, usd: 0, solUsd: null };
  const L = (await readJSON('launches.json')) || [], set = new Set(L.map(x => x.mint)), h = await holdings(op), su = await solUsd().catch(() => null);
  const items = h.tokens.filter(t => set.has(t.mint)).map(t => ({ mint: t.mint, symbol: t.symbol, ui: t.ui, usd: t.usd != null ? t.ui * t.usd : null }));
  let fees = 0; try { const SDK = require('@pump-fun/pump-sdk'), bal = await new SDK.OnlinePumpSdk(conn).getCreatorVaultBalanceBothPrograms(new PublicKey(op)); fees = +bal.toString() / 1e9; } catch { }
  return { items, fees, solUsd: su, usd: items.reduce((s, x) => s + (x.usd || 0), 0) + fees * (su || 0) }; }); }
async function claim(b) { const op = OPERATOR(); if (!op || pk(b.from).toBase58() !== op) throw new Error('only the A1R operator wallet can claim the creator fees'); const SDK = require('@pump-fun/pump-sdk'), online = new SDK.OnlinePumpSdk(conn), me = new PublicKey(op);
  const bal = await online.getCreatorVaultBalanceBothPrograms(me).catch(() => null), lam = bal ? +bal.toString() : 0; if (lam < 10000) return { sol: 0 };
  const ixs = await online.collectCoinCreatorFeeInstructions(me, me), t = new Transaction({ feePayer: me, recentBlockhash: (await conn.getLatestBlockhash('confirmed')).blockhash });
  t.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }), ...ixs, memoIx('a1r:claim'), tagIx(me)); return { sol: lam / 1e9, txs: [t.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')] }; }

// ---------------------------------------------------------------- the handler
module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams), a = String(q.a || 'status');
  try {
    if (req.method === 'GET') {
      if (a === 'status') return out(res, 200, await status(), 'public, max-age=10');
      if (a === 'snap') { if (!hasStore()) return out(res, 200, { at: 0, list: [], off: true }); const s = await snapshot(q.force === '1' && false); return out(res, 200, { at: s.at, eligible: s.eligible, holders: s.holders, mints: s.mints, busy: !!s.busy }); }
      if (a === 'holders') { const s = await readJSON('snap.json'); const n = Math.min(500, +q.n || 100); return out(res, 200, s ? { at: s.at, total: s.total, eligible: s.eligible, holders: s.holders, mints: s.mints, list: s.list.slice(0, n) } : { at: null, list: [] }, 'public, max-age=15'); }
      if (a === 'wallet') return out(res, 200, await walletView(pk(q.w).toBase58()), 'public, max-age=10');
      if (a === 'drops') return out(res, 200, await dropIndex(), 'public, max-age=10');
      if (a === 'drop') { const p = await readJSON(`plan/${clean(q.id, 40).replace(/[^a-z0-9]/g, '')}.json`); return p ? out(res, 200, p, 'public, max-age=10') : out(res, 404, { error: 'no such drop' }); }
      if (a === 'coins') return out(res, 200, await coins(), 'public, max-age=30');
      if (a === 'holdings') return out(res, 200, await holdings(pk(q.w).toBase58()));
      if (a === 'chain') return out(res, 200, await chain(), 'public, max-age=20');
      if (a === 'verify') return out(res, 200, await verify(q.id), 'public, max-age=20');
      if (a === 'sol') return out(res, 200, { usd: await solUsd() }, 'public, max-age=30');
      if (a === 'hold') return out(res, 200, await hold(), 'public, max-age=30');
      return out(res, 400, { error: 'unknown action' });
    }
    const b = await body(req);
    if (a === 'plan') return out(res, 200, await plan(b));
    if (a === 'send') { const sig = await conn.sendRawTransaction(Buffer.from(String(b.tx || ''), 'base64'), { skipPreflight: false, maxRetries: 4 }); return out(res, 200, { sig }); }
    if (a === 'landed') return out(res, 200, await landed(b));
    if (a === 'resume') return out(res, 200, await resume(b));
    if (a === 'scrub') return out(res, 200, await scrub(b));
    if (a === 'claim') return out(res, 200, await claim(b));
    if (a === 'buildLaunch') return out(res, 200, await buildLaunch(b));
    if (a === 'launched') return out(res, 200, await launched(b));
    if (a === 'snapnow') { signed(b, 'snapshot'); return out(res, 200, await snapshot(true).then(s => ({ at: s.at, eligible: s.eligible, holders: s.holders, mints: s.mints }))); }
    if (a === 'fleet') { const mint = signed(b, b.remove ? 'fleet remove' : 'fleet add'); await mintInfo(mint); let L = (await readJSON('fleet.json', true)) || []; L = L.filter(f => f.mint !== mint); if (!b.remove) { const info = (await jupInfo([mint]))[mint] || {}; L.push({ mint, name: clean(b.name, 32) || info.name || mint.slice(0, 4), symbol: info.symbol || null, at: Date.now() }); } await putJSON('fleet.json', L); return out(res, 200, { fleet: L }); }
    if (a === 'launch') { const mint = signed(b, 'launch'); await mintInfo(mint); const info = (await jupInfo([mint]))[mint] || {}; let L = (await readJSON('launches.json', true)) || []; L = L.filter(x => x.mint !== mint); L.unshift({ mint, name: clean(b.name, 32) || info.name || null, symbol: info.symbol || null, at: Date.now() }); await putJSON('launches.json', L.slice(0, 100)); return out(res, 200, { launches: L }); }
    return out(res, 400, { error: 'unknown action' });
  } catch (e) { return out(res, 400, { error: String(e && e.message || e).slice(0, 300) }); }
};
module.exports._t = { resume, scrub, batchTx, snapshot, plan, landed, holdersOf, multOf, verifySig, signed, status, walletView, buildLaunch, launched };
