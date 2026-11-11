// A fake Solana chain, Blob store and Jupiter for local tests of the real A1R API. TEST DATA ONLY: every wallet here is generated locally,
// nothing touches mainnet. It answers the JSON-RPC calls web3.js makes, records sent transactions, and parses them back like a real node.
const path = require('path'), crypto = require('crypto');
const W = p => require(path.join(__dirname, '..', 'node_modules', p));
const { PublicKey, Keypair, Transaction, SystemProgram } = W('@solana/web3.js'); const SPL = W('@solana/spl-token'); const bs58 = W('bs58');
const TOKEN = SPL.TOKEN_PROGRAM_ID.toBase58(), T22 = SPL.TOKEN_2022_PROGRAM_ID.toBase58(), MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', SYS = '11111111111111111111111111111111';
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const kp = () => Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => Math.floor(rnd() * 256)));
const chain = { mints: {}, accounts: [], sol: {}, txs: [], slot: 300000000 };
function addMint(pub, program, decimals, supply) { chain.mints[pub] = { program, decimals, supply: BigInt(supply) }; }
function give(owner, mint, amount) { const m = chain.mints[mint]; const ata = SPL.getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), true, new PublicKey(m.program)).toBase58(); let a = chain.accounts.find(x => x.pubkey === ata); if (!a) { a = { pubkey: ata, mint, owner, amount: 0n }; chain.accounts.push(a); } a.amount += BigInt(amount); return ata; }
function mintData(m) { const b = Buffer.alloc(82); b.writeBigUInt64LE(m.supply, 36); b[44] = m.decimals; b[45] = 1; return b; }
function accData(a) { const b = Buffer.alloc(165); new PublicKey(a.mint).toBuffer().copy(b, 0); new PublicKey(a.owner).toBuffer().copy(b, 32); b.writeBigUInt64LE(a.amount, 64); b[108] = 1; return b; }
const ctx = () => ({ context: { slot: chain.slot, apiVersion: '2.2.0' } });
function rpc(method, params) {
  switch (method) {
    case 'getAccountInfo': { const k = params[0], m = chain.mints[k]; if (m) return { ...ctx(), value: { data: [mintData(m).toString('base64'), 'base64'], executable: false, lamports: 1461600, owner: m.program, rentEpoch: 0, space: 82 } };
      const a = chain.accounts.find(x => x.pubkey === k); if (a) return { ...ctx(), value: { data: [accData(a).toString('base64'), 'base64'], executable: false, lamports: 2039280, owner: chain.mints[a.mint].program, rentEpoch: 0, space: 165 } }; return { ...ctx(), value: null }; }
    case 'getMultipleAccounts': return { ...ctx(), value: params[0].map(k => rpc('getAccountInfo', [k]).value) };
    case 'getProgramAccounts': { const prog = params[0], o = params[1] || {}, f = (o.filters || []).find(x => x.memcmp), mint = f && f.memcmp.bytes, sl = o.dataSlice;
      return chain.accounts.filter(a => a.mint === mint && chain.mints[a.mint].program === prog).map(a => { let d = accData(a); if (sl) d = d.subarray(sl.offset, sl.offset + sl.length); return { pubkey: a.pubkey, account: { data: [d.toString('base64'), 'base64'], executable: false, lamports: 2039280, owner: prog, rentEpoch: 0, space: 165 } }; }); }
    case 'getBalance': return { ...ctx(), value: chain.sol[params[0]] || 0 };
    case 'getTokenAccountBalance': { const a = chain.accounts.find(x => x.pubkey === params[0]); if (!a) throw { code: -32602, message: 'Invalid param: could not find account' }; const d = chain.mints[a.mint].decimals; return { ...ctx(), value: { amount: a.amount.toString(), decimals: d, uiAmount: Number(a.amount) / 10 ** d, uiAmountString: String(Number(a.amount) / 10 ** d) } }; }
    case 'getLatestBlockhash': return { ...ctx(), value: { blockhash: bs58.encode(crypto.createHash('sha256').update('bh' + chain.slot).digest()), lastValidBlockHeight: chain.slot + 150 } };
    case 'getTokenAccountsByOwner': case 'getParsedTokenAccountsByOwner': { const owner = params[0], prog = params[1].programId; return { ...ctx(), value: chain.accounts.filter(a => a.owner === owner && chain.mints[a.mint].program === prog).map(a => { const d = chain.mints[a.mint].decimals; return { pubkey: a.pubkey, account: { data: { program: prog === TOKEN ? 'spl-token' : 'spl-token-2022', parsed: { info: { isNative: false, mint: a.mint, owner: a.owner, state: 'initialized', tokenAmount: { amount: a.amount.toString(), decimals: d, uiAmount: Number(a.amount) / 10 ** d, uiAmountString: String(Number(a.amount) / 10 ** d) } }, type: 'account' }, space: 165 }, executable: false, lamports: 2039280, owner: prog, rentEpoch: 0, space: 165 } }; }) }; }
    case 'sendTransaction': { const raw = Buffer.from(params[0], 'base64'), tx = Transaction.from(raw), sig = bs58.encode(crypto.randomBytes(64)); chain.slot += 3; chain.txs.push({ sig, tx, slot: chain.slot, at: Math.floor(Date.now() / 1000) }); apply(tx); return sig; }
    case 'getSignatureStatuses': return { ...ctx(), value: params[0].map(s => chain.txs.find(t => t.sig === s) ? { slot: chain.slot, confirmations: null, err: null, status: { Ok: null }, confirmationStatus: 'confirmed' } : null) };
    case 'getTransaction': { const t = chain.txs.find(x => x.sig === params[0]); return t ? parsed(t) : null; }
    case 'getSignaturesForAddress': { const k = params[0]; return chain.txs.filter(t => t.tx.compileMessage().accountKeys.some(a => a.toBase58() === k)).reverse().slice(0, (params[1] || {}).limit || 1000).map(t => ({ signature: t.sig, slot: t.slot, err: null, memo: null, blockTime: t.at, confirmationStatus: 'confirmed' })); }
    case 'simulateTransaction': return { ...ctx(), value: { err: null, logs: [], accounts: null, unitsConsumed: 1000, returnData: null } };
    case 'getMinimumBalanceForRentExemption': return 2039280;
    default: throw { code: -32601, message: 'fake chain does not do ' + method };
  }
}
// what a sent transaction does to the fake chain: SOL moves, tokens move
function apply(tx) { for (const ix of tx.instructions) { const p = ix.programId.toBase58();
    if (p === SYS && ix.data.readUInt32LE(0) === 2) { const lam = Number(ix.data.readBigUInt64LE(4)), from = ix.keys[0].pubkey.toBase58(), to = ix.keys[1].pubkey.toBase58(); chain.sol[from] = (chain.sol[from] || 0) - lam; chain.sol[to] = (chain.sol[to] || 0) + lam; }
    if ((p === TOKEN || p === T22) && ix.data[0] === 12) { const amt = ix.data.readBigUInt64LE(1), src = ix.keys[0].pubkey.toBase58(), mint = ix.keys[1].pubkey.toBase58(), dst = ix.keys[2].pubkey.toBase58(), s = chain.accounts.find(a => a.pubkey === src);
      if (s) s.amount -= amt; let d = chain.accounts.find(a => a.pubkey === dst); if (!d) { const ataIx = tx.instructions.find(i => i.programId.toBase58() === SPL.ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() && i.keys[1].pubkey.toBase58() === dst); const owner = ataIx ? ataIx.keys[2].pubkey.toBase58() : dst; d = { pubkey: dst, mint, owner, amount: 0n }; chain.accounts.push(d); } d.amount += amt; } } }
function parsed(t) { const msg = t.tx.compileMessage(), keys = msg.accountKeys.map((k, i) => ({ pubkey: k.toBase58(), signer: msg.isAccountSigner(i), writable: msg.isAccountWritable(i), source: 'transaction' }));
  const ins = t.tx.instructions.map(ix => { const p = ix.programId.toBase58(); if (p === MEMO) return { program: 'spl-memo', programId: MEMO, parsed: ix.data.toString('utf8'), stackHeight: null };
    if (p === SYS && ix.data.readUInt32LE(0) === 2) return { program: 'system', programId: SYS, parsed: { type: 'transfer', info: { source: ix.keys[0].pubkey.toBase58(), destination: ix.keys[1].pubkey.toBase58(), lamports: Number(ix.data.readBigUInt64LE(4)) } }, stackHeight: null };
    return { programId: p, accounts: ix.keys.map(k => k.pubkey.toBase58()), data: bs58.encode(ix.data), stackHeight: null }; });
  return { slot: t.slot, blockTime: t.at, version: 'legacy', meta: { err: null, fee: 5000, preBalances: keys.map(() => 0), postBalances: keys.map(() => 0), innerInstructions: [], logMessages: [], preTokenBalances: [], postTokenBalances: [], status: { Ok: null }, computeUnitsConsumed: 1000 },
    transaction: { signatures: [t.sig], message: { accountKeys: keys, instructions: ins, recentBlockhash: msg.recentBlockhash } } }; }
// ---------------------------------------------------------------- the blob store and jupiter
const store = new Map();
const blobMod = { put: async (p, data) => { store.set(p, typeof data === 'string' ? data : Buffer.from(data).toString()); return { url: 'https://teststore.public.blob.vercel-storage.com/' + p }; }, head: async p => store.has(p) ? { url: 'https://teststore.public.blob.vercel-storage.com/' + p } : null };
const JUPI = {};
function install() {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_x'; process.env.BLOB_STORE_ID = 'store_teststore'; process.env.A1R_TEST = '1';
  const Module = require('module'), orig = Module._load; Module._load = function (req, ...a) { if (req === '@vercel/blob') return blobMod; return orig.call(this, req, ...a); };
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => { const u = String(url);
    if (/solana|rpc/.test(u.split('/')[2] || '')) { const body = JSON.parse(opts.body), one = b => { try { return { jsonrpc: '2.0', id: b.id, result: rpc(b.method, b.params || []) }; } catch (e) { return { jsonrpc: '2.0', id: b.id, error: e.code ? e : { code: -32000, message: String(e.message || e) } }; } };
      const res = Array.isArray(body) ? body.map(one) : one(body); return new Response(JSON.stringify(res), { status: 200, headers: { 'content-type': 'application/json' } }); }
    if (u.includes('.public.blob.vercel-storage.com/')) { const p = decodeURIComponent(u.split('.com/')[1].split('?')[0]); return store.has(p) ? new Response(store.get(p), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 }); }
    if (u.includes('lite-api.jup.ag/tokens/v2/search')) { const q = new URL(u).searchParams.get('query').split(','); return new Response(JSON.stringify(q.filter(m => JUPI[m]).map(m => ({ id: m, ...JUPI[m] }))), { status: 200 }); }
    if (u.includes('lite-api.jup.ag')) return new Response('[]', { status: 200 });
    return real(url, opts); };
}
module.exports = { chain, store, kp, rnd, addMint, give, install, JUPI, PublicKey, Keypair, Transaction, SPL, TOKEN, T22 };
