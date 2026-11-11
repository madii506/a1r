// end-to-end tests of the real A1R API against the fake chain. TEST DATA ONLY.
const { F, op, A1R, BAG, HALO, NEWC, curve, holders, signMsg, api, call } = require('./world.cjs');
const { Transaction, PublicKey } = F;
let fails = 0, passes = 0; const ok = (c, m) => { if (c) { passes++; } else { fails++; console.log('  FAIL', m); } };
const OP = op.publicKey.toBase58(), T = api._t;
const clocks = () => JSON.parse(F.store.get('a1r/clocks.json')), setClocks = v => F.store.set('a1r/clocks.json', JSON.stringify(v));
async function sendAll(txs) { const sigs = []; for (const t of txs) { const r = await call('POST', 'send', {}, { tx: t }); sigs.push(r.j.sig); } return sigs; }
(async () => {
  console.log('status');
  let r = await call('GET', 'status'); ok(r.code === 200 && r.j.live === true && r.j.test === true, 'status live'); ok(r.j.mint === A1R && r.j.operator === OP, 'status keys');
  console.log('operator messages');
  const ts = Date.now();
  r = await call('POST', 'fleet', {}, { msg: `a1r: fleet add ${BAG} at ${ts}`, sig: signMsg(`a1r: fleet add ${BAG} at ${ts}`), name: 'test coin one' }); ok(r.code === 200 && r.j.fleet.length === 1, 'fleet add: ' + JSON.stringify(r.j).slice(0, 120));
  r = await call('POST', 'fleet', {}, { msg: `a1r: fleet add ${HALO} at ${ts}`, sig: signMsg(`a1r: fleet add ${HALO} at ${ts}`) }); ok(r.code === 200 && r.j.fleet.length === 2, 'fleet add 2');
  r = await call('POST', 'fleet', {}, { msg: `a1r: fleet add ${NEWC} at ${ts}`, sig: signMsg(`a1r: fleet add ${BAG} at ${ts}`) }); ok(r.code === 400 && /operator/.test(r.j.error), 'bad signature refused');
  r = await call('POST', 'fleet', {}, { msg: `a1r: fleet add ${NEWC} at ${ts - 3600e3}`, sig: signMsg(`a1r: fleet add ${NEWC} at ${ts - 3600e3}`) }); ok(r.code === 400 && /too old/.test(r.j.error), 'stale signature refused');
  r = await call('POST', 'launch', {}, { msg: `a1r: launch ${NEWC} at ${ts}`, sig: signMsg(`a1r: launch ${NEWC} at ${ts}`), name: 'test launch' }); ok(r.code === 200 && r.j.launches[0].mint === NEWC, 'launch registered');
  console.log('snapshot');
  r = await call('GET', 'snap'); ok(r.code === 200 && r.j.eligible > 0, 'snapshot taken: ' + JSON.stringify(r.j).slice(0, 200));
  let snap = JSON.parse(F.store.get('a1r/snap.json'));
  ok(!snap.list.find(x => x.w === curve), 'bonding curve left out'); ok(!snap.list.find(x => x.w === OP), 'operator left out');
  const minUi = 1e9 * 0.01 / 100; ok(snap.list.every(x => Math.max(x.a ? x.a.ui : 0, ...Object.values(x.f).map(y => y.ui)) >= minUi * .999), 'dust left out');
  ok(snap.mints.length === 3, 'three mints read'); ok(Math.abs(snap.list.reduce((s, x) => s + x.pct, 0) - 1) < 1e-9, 'weights sum to 1');
  ok(snap.list.every((x, i, L) => i === 0 || L[i - 1].wt >= x.wt), 'sorted by weight'); ok(snap.list.every(x => (!x.a || x.a.m === 1)), 'fresh clocks at 1x');
  r = await call('GET', 'snap'); ok(JSON.parse(F.store.get('a1r/snap.json')).at === snap.at, 'throttled: no second snapshot within 10 minutes');
  console.log('clocks');
  const c = clocks(), now = Date.now(); let n = 0; for (const w of Object.keys(c[A1R])) { const age = [0, 2, 5, 9, 16, 30][n++ % 6]; c[A1R][w].s = now - age * 86400e3; } for (const w of Object.keys(c[BAG])) c[BAG][w].s = now - 20 * 86400e3; setClocks(c);
  snap = await T.snapshot(true); const m30 = snap.list.find(x => x.a && x.a.since <= now - 29 * 86400e3), m7 = snap.list.find(x => x.a && Math.abs(x.a.since - (now - 9 * 86400e3)) < 5000);
  ok(m30 && Math.abs(m30.a.m - 3) < 1e-6, 'clock caps at 3x after 14 days'); ok(m7 && Math.abs(m7.a.m - (1 + 2 * 9 / 14)) < 1e-3, 'clock at 9 days: ' + (m7 && m7.a.m));
  // a seller: halve one old holder's $A1R
  const seller = m30.w, acc = F.chain.accounts.find(a => a.owner === seller && a.mint === A1R); acc.amount = acc.amount / 2n; snap = await T.snapshot(true);
  const s2 = snap.list.find(x => x.w === seller); ok(s2 && s2.a.m === 1 && Date.now() - s2.a.since < 10000, 'selling resets the clock');
  // a buyer: double one old holder's $A1R, the clock keeps running
  const buyer = snap.list.find(x => x.a && x.a.m === 3 && x.w !== seller).w, acc2 = F.chain.accounts.find(a => a.owner === buyer && a.mint === A1R); acc2.amount *= 2n; snap = await T.snapshot(true);
  ok(snap.list.find(x => x.w === buyer).a.m === 3, 'buying more keeps the clock');
  const both = snap.list.find(x => x.a && Object.keys(x.f).length); ok(both && Math.abs(both.wt - (both.a.sh * both.a.m + Object.values(both.f).reduce((s, y) => s + y.sh * y.m * .25, 0))) / both.wt < 2e-3, 'weight formula');
  console.log('a SOL drop');
  r = await call('POST', 'plan', {}, { from: holders[0], kind: 'sol', amount: 1 }); ok(r.code === 400 && /operator/.test(r.j.error), 'only the operator builds drops');
  r = await call('POST', 'plan', {}, { from: OP, kind: 'sol', amount: 2 }); ok(r.code === 200 && r.j.txs.length > 1, 'sol plan: ' + JSON.stringify({ ...r.j, txs: r.j.txs && r.j.txs.length }));
  const plan = r.j; let total = 0n, recips = new Set(), memoOk = true, tagOk = true, sizeOk = true;
  for (const [k, t64] of plan.txs.entries()) { const raw = Buffer.from(t64, 'base64'); if (raw.length > 1232) sizeOk = false; const tx = Transaction.from(raw);
    for (const ix of tx.instructions) { const p = ix.programId.toBase58(); if (p === '11111111111111111111111111111111') { const lam = ix.data.readBigUInt64LE(4), to = ix.keys[1].pubkey.toBase58(); if (to === 'JBw4Yw49d6euyRBmsB2NqLatQvedyBLWyNNPr6S4d2rM') { if (lam !== 0n) tagOk = false; } else { total += lam; recips.add(to); if (lam < 500000n) memoOk = false; } } }
    const memo = tx.instructions.find(i => i.programId.toBase58().startsWith('Memo')); if (!memo || !new RegExp(`^a1r:drop:${plan.id}:sol:SOL:${k + 1}/${plan.txs.length}$`).test(memo.data.toString())) memoOk = false; }
  ok(total === 2000000000n, 'sol drop sums to exactly 2 SOL: ' + total); ok(recips.size === plan.wallets, 'one transfer per wallet'); ok(memoOk, 'memos and minimums'); ok(tagOk, 'tag touch is 0 lamports'); ok(sizeOk, 'every batch fits');
  const elig = new Set(snap.list.map(x => x.w)); ok([...recips].every(w => elig.has(w)), 'only manifest wallets');
  const drops0 = JSON.parse(F.store.get('a1r/drops.json')); ok(drops0[0].status === 'boarding', 'drop is boarding before it flies');
  const sigs = await sendAll(plan.txs); r = await call('POST', 'landed', {}, { id: plan.id, sigs: sigs.slice(0, 1) }); ok(r.code === 200 && r.j.status === 'in flight' && r.j.landed === 1, 'partly landed: ' + JSON.stringify(r.j));
  r = await call('POST', 'landed', {}, { id: plan.id, sigs }); ok(r.code === 200 && r.j.status === 'landed' && r.j.landed === plan.txs.length, 'landed: ' + JSON.stringify(r.j));
  r = await call('POST', 'landed', {}, { id: plan.id, sigs }); const recv = JSON.parse(F.store.get('a1r/recv.json')); const solSum = Object.values(recv).reduce((s, x) => s + x.sol, 0); ok(Math.abs(solSum - 2) < 1e-9, 'landing twice does not double count: ' + solSum);
  ok(F.chain.sol[[...recips][0]] > 0, 'SOL arrived on the fake chain');
  console.log('a coin drop');
  r = await call('POST', 'plan', {}, { from: OP, kind: 'token', mint: BAG, amount: 40000000 }); ok(r.code === 400 && /holds/.test(r.j.error), 'cannot drop more than the operator holds');
  r = await call('POST', 'plan', {}, { from: OP, kind: 'token', mint: BAG, amount: 30000000 }); ok(r.code === 200, 'token plan: ' + JSON.stringify({ ...r.j, txs: r.j.txs && r.j.txs.length }));
  const tp = r.j; let tsum = 0n, tsizes = true; for (const t64 of tp.txs) { const raw = Buffer.from(t64, 'base64'); if (raw.length > 1232) tsizes = false; const tx = Transaction.from(raw); for (const ix of tx.instructions) if (ix.programId.equals(F.SPL.TOKEN_PROGRAM_ID) && ix.data[0] === 12) tsum += ix.data.readBigUInt64LE(1); }
  ok(tsum === 30000000000000n, 'coin drop sums to exactly 30M: ' + tsum); ok(tsizes, 'coin batches fit');
  const before = F.chain.accounts.filter(a => a.mint === BAG).reduce((s, a) => s + a.amount, 0n); const tsigs = await sendAll(tp.txs); r = await call('POST', 'landed', {}, { id: tp.id, sigs: tsigs }); ok(r.j.status === 'landed', 'coin drop landed');
  const opBag = F.chain.accounts.find(a => a.owner === OP && a.mint === BAG); ok(opBag.amount === 0n, 'operator sent its whole dev buy'); ok(F.chain.accounts.filter(a => a.mint === BAG).reduce((s, a) => s + a.amount, 0n) === before, 'no coin created or lost');
  console.log('reads');
  r = await call('GET', 'status'); ok(r.j.drops === 2 && r.j.walletsHit > 100 && r.j.coinsDropped === 1 && Math.abs(r.j.solDropped - 2) < 1e-9, 'status totals: ' + JSON.stringify({ d: r.j.drops, w: r.j.walletsHit, c: r.j.coinsDropped, s: r.j.solDropped }));
  const top = JSON.parse(F.store.get('a1r/snap.json')).list[0].w; r = await call('GET', 'wallet', { w: top }); ok(r.j.entry && r.j.entry.rank === 1 && r.j.received.sol > 0 && r.j.received.drops.length === 2, 'wallet view of the top holder');
  r = await call('GET', 'wallet', { w: holders[299] }); ok(r.code === 200, 'wallet view of a fleet-only holder');
  r = await call('GET', 'wallet', { w: 'nope' }); ok(r.code === 400, 'bad address refused');
  r = await call('GET', 'chain'); ok(r.j.filter(x => x.memo.startsWith('a1r:drop:')).length === plan.txs.length + tp.txs.length, 'the chain index finds every batch');
  r = await call('GET', 'verify', { id: plan.id }); ok(r.j.ok === r.j.of && r.j.of === plan.txs.length, 'verify: every batch checks out: ' + JSON.stringify({ ok: r.j.ok, of: r.j.of }));
  r = await call('GET', 'drop', { id: plan.id }); ok(r.j.sigs.length === plan.txs.length, 'drop record');
  r = await call('GET', 'coins'); ok(r.j.length === 3 && r.j[0].a1r && r.j[0].symbol === 'A1R', 'coins list');
  r = await call('GET', 'holdings', { w: OP }); ok(r.j.tokens && r.j.tokens.some(t => t.mint === NEWC), 'operator holdings: ' + JSON.stringify(r.j).slice(0, 200));
  r = await call('POST', 'landed', {}, { id: plan.id, sigs: ['5'.repeat(88)] }); ok(r.code === 400, 'unknown signatures refused');
  r = await call('POST', 'claim', {}, { from: OP }); ok(r.code === 200 || /fetch|account|find/i.test(r.j.error || ''), 'claim answers: ' + JSON.stringify(r.j).slice(0, 160));
  r = await call('POST', 'plan', {}, { from: OP, kind: 'sol', amount: 0.0001 }); ok(r.code === 400 && /too small/.test(r.j.error), 'a tiny drop is refused: ' + r.j.error);
  console.log('resume and scrub');
  { r = await call('POST', 'plan', {}, { from: OP, kind: 'sol', amount: 1.5 }); const P = r.j, half = Math.ceil(P.txs.length / 2); const sent = []; for (const t of P.txs.slice(0, half)) sent.push((await call('POST', 'send', {}, { tx: t })).j.sig);
    await call('POST', 'landed', {}, { id: P.id, sigs: sent.slice(0, 1) });   // the client lost track after the first batch
    r = await call('POST', 'resume', {}, { from: OP, id: P.id }); ok(r.code === 200 && r.j.left === P.txs.length - half, 'resume recovers landed batches from the chain and rebuilds only the rest: ' + JSON.stringify({ left: r.j.left, of: P.txs.length, half }));
    const more = []; for (const t of r.j.txs) more.push((await call('POST', 'send', {}, { tx: t })).j.sig); r = await call('POST', 'landed', {}, { id: P.id, sigs: more }); ok(r.j.status === 'landed', 'resumed drop landed');
    const d = JSON.parse(F.store.get(`a1r/plan/${P.id}.json`)); const recv = JSON.parse(F.store.get('a1r/recv.json')); let got = 0; for (const b of d.batches) for (const [w, v] of b) got += Number(v); ok(got === 1.5e9, 'the plan still sums to 1.5 SOL');
    const paid = F.chain.txs.filter(t => t.tx.instructions.some(i => i.programId.toBase58().startsWith('Memo') && i.data.toString().startsWith(`a1r:drop:${P.id}:`))).length; ok(paid === P.txs.length, 'no batch was sent twice: ' + paid + ' of ' + P.txs.length);
    r = await call('POST', 'resume', {}, { from: OP, id: P.id }); ok(r.j.left === 0, 'nothing left to resume');
    r = await call('POST', 'plan', {}, { from: OP, kind: 'sol', amount: .3 }); const Q = r.j, t3 = Date.now();
    r = await call('POST', 'scrub', {}, { msg: `a1r: scrub ${Q.id} at ${t3}`, sig: signMsg(`a1r: scrub ${Q.id} at ${t3}`) }); ok(r.code === 200 && r.j.status === 'scrubbed', 'a drop that never flew can be scrubbed: ' + JSON.stringify(r.j));
    r = await call('POST', 'scrub', {}, { msg: `a1r: scrub ${P.id} at ${t3}`, sig: signMsg(`a1r: scrub ${P.id} at ${t3}`) }); ok(r.code === 400, 'a drop that flew cannot be scrubbed');
    r = await call('GET', 'status'); const rs = Object.values(JSON.parse(F.store.get('a1r/recv.json'))).reduce((s, x) => s + x.sol, 0); ok(Math.abs(r.j.solDropped - rs) < 1e-9 && Math.abs(rs - 3.5) < 1e-6, 'SOL dropped counts what actually landed: ' + r.j.solDropped); }
  console.log('launches');
  { const NM = F.kp().publicKey.toBase58(), t2 = Date.now(), msg = `a1r: launch ${NM} at ${t2}`;
    r = await call('POST', 'buildLaunch', {}, { msg, sig: signMsg(msg), name: 'x', symbol: 'x', devBuy: 50, image: 'data:image/png;base64,iVBORw0KGgo=' }); ok(r.code === 400 && /between/.test(r.j.error), 'dev buy limits: ' + r.j.error);
    r = await call('POST', 'buildLaunch', {}, { msg, sig: signMsg(msg), name: 'x', symbol: 'x', devBuy: 1 }); ok(r.code === 400 && /image/.test(r.j.error), 'launch needs an image');
    r = await call('POST', 'buildLaunch', {}, { msg, sig: signMsg(msg), name: 'test', symbol: 'tst', devBuy: 1, image: 'data:image/png;base64,iVBORw0KGgo=' }); ok(r.code === 400 && F.store.has(`a1r/meta/${NM}.json`), 'launch writes metadata, then needs the real pump.fun program (fake chain): ' + r.j.error);
    const meta = JSON.parse(F.store.get(`a1r/meta/${NM}.json`)); ok(meta.symbol === 'TST' && meta.image.includes('/a1r/img/'), 'metadata: ' + JSON.stringify(meta));
    // a launch transaction as the cockpit would send it: memo + tag, signed by the operator
    const { Transaction, SystemProgram, TransactionInstruction } = require(require('path').join(__dirname, '..', 'node_modules', '@solana', 'web3.js')); const tx = new Transaction({ feePayer: op.publicKey, recentBlockhash: '11111111111111111111111111111111' });
    tx.add(new TransactionInstruction({ programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), keys: [], data: Buffer.from(`a1r:launch:${NM}`) }), SystemProgram.transfer({ fromPubkey: op.publicKey, toPubkey: new PublicKey('JBw4Yw49d6euyRBmsB2NqLatQvedyBLWyNNPr6S4d2rM'), lamports: 0 }));
    const sg = (await call('POST', 'send', {}, { tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64') })).j.sig;
    r = await call('POST', 'launched', {}, { mint: NM, sig: sg }); ok(r.code === 200 && r.j.launches[0].mint === NM, 'a confirmed launch is registered: ' + JSON.stringify(r.j).slice(0, 120));
    ok(JSON.parse(F.store.get('a1r/fleet.json')).some(f => f.mint === NM), 'and joins the fleet');
    r = await call('POST', 'launched', {}, { mint: BAG, sig: sg }); ok(r.code === 400, 'a launch memo for another coin is refused'); }
  console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
