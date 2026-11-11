// builds a fake world for local tests: $A1R, two of our coins, ~300 holders, dust, a bonding curve, and an operator. TEST DATA ONLY.
const F = require('./fake.cjs'), crypto = require('crypto');
F.install();
const { PublicKey, Keypair } = F;
const op = F.kp(), A1R = F.kp().publicKey.toBase58(), BAG = F.kp().publicKey.toBase58(), HALO = F.kp().publicKey.toBase58(), NEWC = F.kp().publicKey.toBase58();
process.env.A1R_OPERATOR = op.publicKey.toBase58(); process.env.A1R_MINT = A1R;
F.addMint(A1R, F.T22, 6, 1000000000000000n); F.addMint(BAG, F.TOKEN, 6, 1000000000000000n); F.addMint(HALO, F.TOKEN, 6, 1000000000000000n); F.addMint(NEWC, F.TOKEN, 6, 1000000000000000n);
F.JUPI[A1R] = { symbol: 'A1R', name: 'A1R (test)', decimals: 6, usdPrice: 0.0000412, mcap: 41200, holderCount: 312, stats24h: { priceChange: 18.4, buyVolume: 52000, sellVolume: 31000 } };
F.JUPI[BAG] = { symbol: 'TESTBAG', name: 'test coin one', decimals: 6, usdPrice: 0.0000187, mcap: 18700, holderCount: 141, stats24h: { priceChange: -6.2, buyVolume: 9000, sellVolume: 7000 } };
F.JUPI[HALO] = { symbol: 'TESTHALO', name: 'test coin two', decimals: 6, usdPrice: 0.0000093, mcap: 9300, holderCount: 77, stats24h: { priceChange: 3.1, buyVolume: 2000, sellVolume: 1500 } };
F.JUPI[NEWC] = { symbol: 'TESTNEW', name: 'test launch', decimals: 6, usdPrice: 0.000006, mcap: 6000, holderCount: 12, stats24h: {} };
F.JUPI['So11111111111111111111111111111111111111112'] = { symbol: 'SOL', name: 'Wrapped SOL', decimals: 9, usdPrice: 168.4, stats24h: {} };
const curve = PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), new PublicKey(A1R).toBuffer()], new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')) [0].toBase58();
F.give(curve, A1R, 612000000000000n);
const holders = []; for (let i = 0; i < 300; i++) holders.push(F.kp().publicKey.toBase58());
let left = 380000000000000n; holders.forEach((w, i) => { const amt = BigInt(Math.floor(Number(left) * 0.06 / Math.pow(i + 1, .55))) ; if (i < 260) F.give(w, A1R, amt > 200000000000n ? amt : 200000000000n); });
for (let i = 0; i < 40; i++) F.give(F.kp().publicKey.toBase58(), A1R, BigInt(1000000000 + Math.floor(F.rnd() * 40000000000)));   // dust under the minimum
holders.slice(150, 300).forEach((w, i) => F.give(w, BAG, BigInt(Math.floor(2e14 / (i + 3)))));
holders.slice(200, 260).forEach((w, i) => F.give(w, HALO, BigInt(Math.floor(1e14 / (i + 2)))));
F.give(op.publicKey.toBase58(), BAG, 30000000000000n); F.give(op.publicKey.toBase58(), NEWC, 50000000000000n); F.chain.sol[op.publicKey.toBase58()] = 40e9;
const pkcs8 = seed => crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seed)]), format: 'der', type: 'pkcs8' });
const signMsg = msg => crypto.sign(null, Buffer.from(msg), pkcs8(op.secretKey.slice(0, 32))).toString('base64');
const api = require(require('path').join(__dirname, '..', 'api', 'a1r.js'));
function call(method, a, q = {}, body) { return new Promise(ok => { const req = { method, query: { a, ...q }, body: body || null, url: '/api/a1r?a=' + a }; let code = 200, hd = {}; const res = { set statusCode(c) { code = c; }, get statusCode() { return code; }, setHeader: (k, v) => hd[k] = v, end: s => ok({ code, j: JSON.parse(s) }) }; api(req, res); }); }
module.exports = { F, op, A1R, BAG, HALO, NEWC, curve, holders, signMsg, api, call };
