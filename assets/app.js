// A1R: the site. A drop zone, a departures board of every drop, a boarding pass for any wallet, a radar of who's holding,
// our fleet of coins, the rules, the operator's console and a terminal. Every number here is read from the A1R API (and the chain behind it).
(() => {
  'use strict';
  const A = window.AIR, SND = A.snd, esc = A.esc, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const API = '/api/a1r', S = { status: null, drops: null, holders: null, coins: null, solUsd: null, wallet: null, views: {} };
  const short = (w, n = 4) => w ? w.slice(0, n) + '…' + w.slice(-n) : '—';
  const fmt = (n, d = 2) => n == null || !isFinite(n) ? '—' : Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : (+n).toLocaleString('en-US', { maximumFractionDigits: d });
  const usd = n => n == null ? '—' : '$' + fmt(n, n < 1 ? 6 : 2);
  const pct = (n, d = 2) => n == null ? '—' : (n * 100).toFixed(n * 100 < .01 && n > 0 ? 4 : d) + '%';
  const ago = ms => { if (!ms) return '—'; const s = Math.max(0, (Date.now() - ms) / 1000); return s < 60 ? Math.round(s) + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
  const when = ms => ms ? new Date(ms).toISOString().slice(5, 16).replace('T', ' ') : '—';
  const days = ms => ms ? Math.max(0, (Date.now() - ms) / 86400e3) : 0;
  const DAYS_SINCE = () => Math.max(0, Math.floor((Date.now() - Date.UTC(2025, 6, 9)) / 86400e3));
  const solscan = (k, v) => `https://solscan.io/${k}/${v}`;
  async function api(a, q = '') { const r = await fetch(`${API}?a=${a}${q}`); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || r.status); return j; }
  async function post(a, b) { const r = await fetch(`${API}?a=${a}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || r.status); return j; }
  function toast(m) { const t = $('#toast'); t.innerHTML = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 4200); }
  const copy = (text, what) => { const ok = () => { toast((what || 'Copied') + ' copied'); SND.blip(990, .03); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => toast(esc(text))); else toast(esc(text)); };
  const CRATE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.2C3 5 7 2.6 12 2.6S21 5 21 9.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.4 9.6 9 15M20.6 9.6 15 15M12 9.6V15" stroke="currentColor" stroke-width="1.3"/><rect x="7.6" y="14.6" width="8.8" height="7" rx="1" fill="currentColor"/><path d="M8.6 15.6l6.8 5M15.4 15.6l-6.8 5" stroke="#000" stroke-width="1.1"/></svg>';
  const cargoOf = d => d.kind === 'sol' ? 'SOL' : ((S.coins || []).find(c => c.mint === d.mint) || ((S.status || {}).launches || []).find(c => c.mint === d.mint) || {}).symbol || short(d.mint, 3);
  const amtOf = d => Number(BigInt(d.amount || 0)) / 10 ** (d.decimals ?? 9);
  const flight = d => { const L = (S.drops || []).slice().reverse(), i = L.findIndex(x => x.id === d.id); return 'A1R-' + String(i + 1).padStart(3, '0'); };
  const stClass = s => s === 'landed' ? 'landed' : s === 'in flight' ? 'inflight' : s === 'scrubbed' ? 'scrubbed' : 'boarding';

  // ---------------------------------------------------------------- wallet
  const WL = { pk: null, p: null };
  const WALLETS = [['Phantom', () => window.phantom && window.phantom.solana, 'https://phantom.com/download'], ['Solflare', () => window.solflare && window.solflare.isSolflare && window.solflare, 'https://solflare.com/download'], ['Backpack', () => window.backpack, 'https://backpack.app/download']];
  async function connect() { const found = WALLETS.find(w => w[1]()); if (!found) { openDrawer(`<h3 class="h2">Connect a wallet</h3><p class="mut" style="margin:12px 0 20px">A1R only needs your address. It never asks for a seed phrase or a private key.</p><div class="row">${WALLETS.map(w => `<a class="btn" target="_blank" rel="noopener" href="${w[2]}">get ${w[0]} ↗</a>`).join('')}</div>`); return null; }
    const p = found[1](); try { const r = await p.connect(); WL.p = p; WL.pk = ((r && r.publicKey) || p.publicKey).toString(); if (p.on && !p._a) { p._a = 1; p.on('accountChanged', k => { WL.pk = k ? k.toString() : null; paintWallet(); route(); }); } paintWallet(); SND.chime(); route(); return WL.pk; } catch (e) { toast('Connection cancelled'); return null; } }
  async function disconnect() { try { await WL.p.disconnect(); } catch (e) { } WL.pk = null; paintWallet(); route(); }
  function paintWallet() { const b = $('#wbtn'); b.innerHTML = WL.pk ? `<span class="dotw"></span>${short(WL.pk)}` : 'connect'; b.classList.toggle('on', !!WL.pk); }
  let w3 = null; const web3 = () => w3 || (w3 = new Promise((ok, no) => { if (window.solanaWeb3) return ok(window.solanaWeb3); const s = document.createElement('script'); s.src = '/assets/web3.min.js'; s.onload = () => ok(window.solanaWeb3); s.onerror = () => no(new Error('could not load the signer')); document.head.append(s); }));
  const b64 = u => { let s = ''; u.forEach(c => s += String.fromCharCode(c)); return btoa(s); }, unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function signSend(list, st, extra) { const W = await web3(); st('check your wallet…'); const txs = list.map(t => W.Transaction.from(unb64(t))); if (extra) extra(txs, W);
    const signed = WL.p.signAllTransactions && txs.length > 1 ? await WL.p.signAllTransactions(txs) : [await WL.p.signTransaction(txs[0])]; const sigs = [];
    for (let i = 0; i < signed.length; i++) { st(signed.length > 1 ? `sending ${i + 1} of ${signed.length}…` : 'sending…'); try { const r = await post('send', { tx: b64(signed[i].serialize({ requireAllSignatures: false, verifySignatures: false })) }); sigs.push(r.sig); } catch (e) { sigs.push(null); st(`batch ${i + 1} failed: ${e.message}`); } }
    return sigs; }
  async function signMsg(text) { if (!WL.p || !WL.p.signMessage) throw new Error('this wallet cannot sign messages'); const r = await WL.p.signMessage(new TextEncoder().encode(text), 'utf8'); const sig = r.signature || r; return b64(sig); }

  // ---------------------------------------------------------------- data
  async function loadStatus() { try { S.status = await api('status'); paintTicker(); if (S.status.test && !$('.testbar')) document.body.insertAdjacentHTML('beforeend', '<div class="testbar">local preview · test data</div>'); } catch (e) { S.status = { error: e.message, fleet: [], launches: [] }; paintTicker(); } }
  async function loadDrops() { try { S.drops = await api('drops'); } catch (e) { S.drops = S.drops || []; } return S.drops; }
  async function loadHolders(n = 300) { try { S.holders = await api('holders', '&n=' + n); } catch (e) { S.holders = S.holders || { list: [] }; } return S.holders; }
  async function loadCoins() { try { S.coins = await api('coins'); } catch (e) { S.coins = S.coins || []; } return S.coins; }
  // keep the snapshot fresh: anyone visiting nudges it (the API takes one at most every 10 minutes)
  const nudge = () => fetch(API + '?a=snap').catch(() => { });

  // ---------------------------------------------------------------- shell
  const NAV = [['zone', '#/', 'drop zone'], ['promise', '#/promise', 'the promise'], ['board', '#/board', 'board'], ['pass', '#/pass', 'boarding pass'], ['radar', '#/radar', 'radar'], ['fleet', '#/fleet', 'fleet'], ['how', '#/how', 'how'], ['ops', '#/ops', 'ops']];
  function shell() {
    $('#top').innerHTML = `<a class="brand" href="#/">${CRATE}A1R<small>the airdrop they promised us</small></a><nav id="nav"><span class="pill"></span>${NAV.map(([k, h, l], i) => `<a href="${h}" data-k="${k}" title="${l} (${i + 1})">${k === 'zone' ? 'zone' : k}</a>`).join('')}</nav>
      <div class="right"><button class="ib" id="sbtn" title="sound (s)"></button><button class="ib" id="tbtn" title="console (\`)">&gt;_</button><button class="ib" id="wbtn">connect</button></div>`;
    $('#foot').innerHTML = `<span>A1R · the airdrop they promised us</span><span>not affiliated with pump.fun · nothing here is financial advice</span><span><a class="lk" href="#/how">rules</a> · <a class="lk" href="#/board">ledger</a> · <a class="lk" id="tagl" target="_blank" rel="noopener" href="#">tag address ↗</a></span>`;
    $('#wbtn').onclick = () => WL.pk ? disconnect() : connect(); $('#tbtn').onclick = () => term.toggle(); $('#sbtn').onclick = () => { SND.set(!SND.on); paintSnd(); if (SND.on) SND.droneOn(.04); };
    paintSnd(); paintWallet();
  }
  const paintSnd = () => { $('#sbtn').innerHTML = SND.on ? '♪' : '<s>♪</s>'; $('#sbtn').classList.toggle('on', false); };
  function movePill() { const on = $('#nav a.on'), p = $('#nav .pill'); if (!on || !p) return; p.style.left = on.offsetLeft + 'px'; p.style.width = on.offsetWidth + 'px'; }
  function paintTicker() { const s = S.status || {}, it = [];
    it.push(`<span><span class="dot"></span>${s.live ? 'live' : 'getting ready'}</span>`);
    it.push(`<span>days since pump.fun's "airdrop coming soon": <b>${DAYS_SINCE()}</b></span>`);
    it.push(`<span>drops landed <b>${s.drops ?? 0}</b></span>`, `<span>wallets hit <b>${s.walletsHit ?? 0}</b></span>`, `<span>SOL dropped <b>${fmt(s.solDropped ?? 0, 4)}</b></span>`);
    it.push(`<span>on the manifest <b>${s.eligible ?? 0}</b> wallets</span>`, `<span>snapshot <b>${s.snapAt ? ago(s.snapAt) : 'not yet'}</b></span>`);
    it.push(s.mint ? `<span>$A1R <b>${short(s.mint, 5)}</b></span>` : `<span>$A1R <b>not live yet</b></span>`);
    const h = it.join(''); $('#tick').innerHTML = `<div class="run">${h}${h}</div>`; const tl = $('#tagl'); if (tl && s.tag) tl.href = solscan('account', s.tag); }

  // ---------------------------------------------------------------- the drawer
  function openDrawer(html) { const d = $('#drawer'); d.innerHTML = `<div class="bg"></div><div class="pn"><button class="x" aria-label="close">✕</button>${html}</div>`; requestAnimationFrame(() => d.classList.add('on')); $('.bg', d).onclick = closeDrawer; $('.x', d).onclick = closeDrawer; SND.whoosh(.35, .04, true); }
  function closeDrawer() { const d = $('#drawer'); d.classList.remove('on'); if (location.hash.startsWith('#/d/')) history.replaceState(null, '', '#/board'); }

  // ---------------------------------------------------------------- the crate in the hero
  let heroStop = null;
  function heroCrate(stage) { const cv = $('canvas', stage), g = cv.getContext('2d'); let W, H, D, yaw = .7, vel = .28, drag = null, raf = 0, last = 0, alive = true;
    const size = () => { D = Math.min(devicePixelRatio || 1, 2); W = stage.clientWidth; H = stage.clientHeight; cv.width = W * D; cv.height = H * D; };
    const dims = A.crateDims(), loop = now => { if (!alive) return; raf = requestAnimationFrame(loop); const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      if (!drag) { yaw += vel * dt; vel += (.28 - vel) * dt * .8; } g.setTransform(D, 0, 0, D, 0, 0); g.clearRect(0, 0, W, H);
      const cw = Math.min(W / (dims.cols * 1.05), H / (dims.rows * 1.917 * 1.04)), sw = Math.sin(now / 1300) * .035, bob = Math.sin(now / 900) * 4;
      g.save(); g.translate(W / 2, H * .08); g.rotate(sw); g.translate(-W / 2, -H * .08); A.drawCrate(g, W / 2, H / 2 + bob, cw, yaw); g.restore(); };
    stage.onpointerdown = e => { drag = { x: e.clientX, y: yaw, t: performance.now() }; stage.setPointerCapture(e.pointerId); SND.tick(.03, 1400); };
    stage.onpointermove = e => { if (!drag) return; const ny = drag.y - (e.clientX - drag.x) / 140, now = performance.now(); vel = (ny - yaw) / Math.max(.016, (now - drag.t) / 1000); yaw = ny; drag.t = now; if (Math.random() < .2) SND.tick(.01, 2400); };
    stage.onpointerup = () => { drag = null; vel = Math.max(-6, Math.min(6, vel)); };
    addEventListener('resize', size); size(); A.crateReady.then(() => { raf = requestAnimationFrame(loop); });
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); }; }

  // ---------------------------------------------------------------- the promise, with sources
  const PROMISE = [
    ['9 Jul 2025', 'pump.fun', 'Announcing the PUMP sale on X: <q>airdrop coming soon</q>.', 'https://protos.com/100-days-later-is-pump-fun-airdrop-still-coming-soon/', 'Protos'],
    ['21 Jul 2025', 'the rumor', 'A post claims a PUMP airdrop on 24 July. Co-founder Alon Cohen answers with a GIF. No date is confirmed.', 'https://crypto.news/pump-funs-alon-reacts-to-news-about-an-alleged-pump-airdrop-on-july-24/', 'crypto.news'],
    ['23 Jul 2025', 'Alon Cohen', 'On a livestream, the airdrop is <q>not going to be taking place in the immediate future</q>. PUMP falls about 14-18% that day.', 'https://decrypt.co/331536/doge-pepe-pump-bleed-as-pump-fun-confirms-no-airdrop-in-immediate-future', 'Decrypt'],
    ['17 Oct 2025', '100 days', 'A check-in finds <q>no developments</q> since the tease.', 'https://protos.com/100-days-later-is-pump-fun-airdrop-still-coming-soon/', 'Protos'],
    ['Dec 2025', 'the Padre claim', 'After buying Padre, pump.fun gives PUMP to PADRE holders. Compensation for one community, not the airdrop.', 'https://protos.com/its-been-365-days-since-pump-fun-promised-an-airdrop-was-coming-soon/', 'Protos'],
    ['29 Apr 2026', 'the burn', 'About $370M of PUMP is bought back and burned. The airdrop is not sent.', 'https://protos.com/its-been-365-days-since-pump-fun-promised-an-airdrop-was-coming-soon/', 'Protos'],
    ['8 Jul 2026', '365 days', 'A year after "coming soon", holders are still waiting.', 'https://protos.com/its-been-365-days-since-pump-fun-promised-an-airdrop-was-coming-soon/', 'Protos']];
  const BUILT = [
    ['the snapshot reader', 'Every holder of $A1R and of our coins, read straight from the token programs every 10 minutes. Pools, curves and the operator are left out.', s => s.snapAt ? `${fmt(s.holders, 0)} holders read · ${ago(s.snapAt)}` : 'first read at launch'],
    ['the clock', 'Each wallet gets a clock per coin: 1x to 3x over 14 days. Selling resets it, buying more never does.', s => `${fmt(s.eligible || 0, 0)} wallets on the clock`],
    ['the drop builder', 'Any cargo, SOL or a coin, split by weight into batches the operator signs. Dust rolls over to the next drop.', s => `${s.drops || 0} drops landed · ${fmt(s.walletsHit || 0, 0)} wallets hit`],
    ['the proof', 'A memo and a touch on the A1R tag address in every batch. Any flight can be checked against the chain from the board.', s => s.tag ? 'tag ' + short(s.tag, 5) : '—'],
    ['the recovery', 'If a batch fails, A1R finds what already landed on-chain before it rebuilds the rest. Nobody gets paid twice.', () => 'resume any flight'],
    ['the cockpit', 'One signature launches a coin on pump.fun with a dev buy. It joins the fleet, and the dev buy becomes cargo.', s => `${(s.launches || []).length} launches · ${(s.fleet || []).length} coins in the fleet`]];
  const timelineHTML = (list, today) => `<ol class="tl">${list.map(([d, who, txt, src, srcN]) => `<li class="ti"><div class="td">${d}</div><div class="tw"><div class="tk">${who}</div><p>${txt}</p><a class="lk mut" target="_blank" rel="noopener" href="${src}">${srcN} ↗</a></div></li>`).join('')}${today ? `<li class="ti now"><div class="td">today</div><div class="tw"><div class="tk">A1R</div><p>${DAYS_SINCE()} days after "coming soon", we stopped waiting and built the airdrop ourselves. Every coin we launch drops to the people holding ours.</p><a class="lk" href="#/board">the board →</a></div></li>` : ''}</ol>`;
  const revealOnScroll = root => { if (!('IntersectionObserver' in window)) { $$('.ti', root).forEach(e => e.classList.add('in')); return; } const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); SND.tick(.015, 2200); } }), { threshold: .25 }); $$('.ti', root).forEach(e => io.observe(e)); };

  // ---------------------------------------------------------------- views
  const V = {};
  V.promise = async m => { const s = S.status || {};
    m.innerHTML = `<section class="tc"><div class="kick">the receipts</div><div class="h1" style="margin-top:10px">they promised.<br>we built.</div>
      <p class="sub">pump.fun said <q>airdrop coming soon</q> on 9 July 2025. This is everything that happened next, each with its source. Then the tech we built instead.</p>
      <div class="bigday"><span class="flap" id="pd"></span><div class="mut">days since "coming soon"</div></div></section>
      <section class="sec"><div class="sec-h"><div><div class="kick">the timeline</div><div class="h2">what they said, what happened.</div></div></div>${timelineHTML(PROMISE, true)}</section>
      <section class="sec"><div class="sec-h"><div><div class="kick">what we built instead</div><div class="h2">six parts, all running.</div></div><a class="btn" href="#/how">the rules</a></div>
        <div class="grid3 built">${BUILT.map(([h, p, live], i) => `<div class="card"><div class="n mut">0${i + 1}</div><h4>${h}</h4><p class="mut">${p}</p><div class="live"><span class="dot"></span>${esc(live(s))}</div></div>`).join('')}</div></section>
      <section class="sec tc"><div class="h2">stop waiting for theirs.</div><div class="row cta" style="justify-content:center;margin-top:18px"><a class="btn pri" href="#/pass">check my boarding pass</a><a class="btn" href="#/how">how a drop lands</a></div>
        <p class="mut" style="font-size:11.5px;margin-top:22px">A1R is not affiliated with pump.fun or anyone at pump.fun. Their airdrop is theirs to give.</p></section>`;
    setTimeout(() => A.flap($('#pd'), String(DAYS_SINCE()), { stag: 90, dur: 1000 }), 150); revealOnScroll(m); };
  const STEP_ART = [
    '      /\\\n     /  \\\n    | A1 |\n    |    |\n   /|____|\\\n     \'\'\'\'',
    '  [ dev buy ]\n       |\n       v\n    .-----.\n    |#####|\n    \'-----\'',
    ' ▇▇▇▇▇▇▇  ×3.0\n ▇▇▇▇▇    ×2.2\n ▇▇▇      ×1.6\n ▇▇       ×1.0\n',
    '    .-""-.\n   /______\\\n    \\ || /\n    [####]\n  ___\\__/___'];
  V.zone = async m => {
    const s = S.status || {};
    m.innerHTML = `<section class="hero"><div class="stage" id="stage"><canvas></canvas><span class="hint">drag to spin</span></div>
      <h1 class="h1">the airdrop<br>they promised us.</h1>
      <p class="sub">Every coin we launch drops a slice to the holders of $A1R and of our coins. Hold longer, get more. Nothing to claim.</p>
      <div class="row cta"><a class="btn pri" href="#/pass">check my wallet →</a><a class="btn" href="#/board">every drop</a></div>
      <div class="ca">${s.mint ? `<button id="cab">$A1R · <b>${short(s.mint, 6)}</b> · copy</button>` : `<span class="pill">$A1R · not live yet</span>`}</div></section>
      <div class="stats">${[['drops landed', 'drops'], ['wallets hit', 'walletsHit'], ['SOL dropped', 'solDropped'], ['coins dropped', 'coinsDropped'], ['on the manifest', 'eligible']].map(([k, f]) => `<div class="stat"><div class="k">${k}</div><div class="v"><span class="flap" data-f="${f}"></span></div></div>`).join('')}</div>
      <section class="sec"><div class="kick tc">the score</div><div class="vs"><div class="side"><div class="kick">pump.fun · "airdrop coming soon"</div><div class="big"><span class="flap" id="theirs"></span></div><div class="mut">days, and counting</div></div><div class="mid">vs</div>
        <div class="side"><div class="kick">A1R · drops that landed</div><div class="big"><span class="flap" id="ours"></span></div><div class="mut">${s.drops ? 'and the board has every one' : 'the first one lands on the board'}</div></div></div></section>
      <section class="sec"><div class="sec-h"><div><div class="kick">the receipts</div><div class="h2">they promised. we built.</div></div><a class="btn" href="#/promise">every receipt</a></div>${timelineHTML([PROMISE[0], PROMISE[2], PROMISE[5], PROMISE[6]], true)}</section>
      <section class="sec"><div class="hold card" id="hold"><div class="kick">in the hold now</div><div class="hv" id="hv">—</div><div class="mut" id="hl">reading the operator wallet…</div></div></section>
      <section class="sec"><div class="sec-h"><div><div class="kick">how a drop lands</div><div class="h2">four steps, all on-chain.</div></div><a class="btn" href="#/how">the full rules</a></div>
        <div class="steps">${[['we launch a coin', 'Every coin we build launches on pump.fun with a dev buy.'], ['the dev buy is set aside', 'That buy is not for selling. It is the cargo for the next drop.'], ['size × time', 'A snapshot every 10 minutes. The longer you hold, the more you weigh: up to 3x.'], ['it lands in your wallet', 'Straight to your wallet, no claiming. Every batch has a memo you can check.']].map(([h, p], i) => `<div class="step"><div class="n">0${i + 1}</div><pre class="${i === 3 ? 'bob' : ''}">${esc(STEP_ART[i])}</pre><h4>${h}</h4><p>${p}</p></div>`).join('')}</div></section>
      <section class="sec grid2"><div><div class="sec-h"><div class="h2">latest drops</div><a class="lk mut" href="#/board">the board →</a></div><div id="zdrops"></div></div>
        <div><div class="sec-h"><div class="h2">top passengers</div><a class="lk mut" href="#/radar">radar →</a></div><div id="ztop"></div></div></section>`;
    heroStop = heroCrate($('#stage')); revealOnScroll(m);
    api('hold').then(h => { if (!$('#hv')) return; S.hold = h; const has = h.usd > 0 || h.fees > 0 || h.items.length; $('#hv').textContent = has ? '$' + fmt(h.usd, 2) : (s.operator ? '$0' : '—');
      $('#hl').innerHTML = has ? [...h.items.map(x => `${fmt(x.ui)} ${esc(x.symbol ? '$' + x.symbol : short(x.mint))}${x.usd != null ? ` <span class="dim">≈ $${fmt(x.usd, 2)}</span>` : ''}`), h.fees > 0 ? `${fmt(h.fees, 4)} SOL of $A1R creator fees, unclaimed` : ''].filter(Boolean).join(' · ') + '<br><span class="dim">this is cargo for the next drops. it drops when the operator flies it.</span>' : s.operator ? 'The hold is empty. It fills when we launch the next coin.' : 'The hold opens when A1R launches.'; }).catch(() => { if ($('#hl')) $('#hl').textContent = 'could not read the hold right now.'; });
    if ($('#cab')) $('#cab').onclick = () => copy(s.mint, 'Contract address');
    const flaps = () => { const st = S.status || {}; $$('.stats .flap').forEach((el, i) => { const f = el.dataset.f, v = st[f] ?? 0; setTimeout(() => A.flap(el, f === 'solDropped' ? fmt(v, 3) : fmt(v, 0)), i * 90); }); A.flap($('#theirs'), String(DAYS_SINCE()), { stag: 80, dur: 900 }); A.flap($('#ours'), String(st.drops ?? 0).padStart(3, '0'), { stag: 80, dur: 900 }); };
    if (window.AI && window.AI.active) window.AI.onDone = flaps; else setTimeout(flaps, 200);
    const [drops, hol] = await Promise.all([loadDrops(), loadHolders(20)]); if (!$('#zdrops')) return;
    $('#zdrops').innerHTML = boardHTML(drops.slice(0, 5), true); wireBoard($('#zdrops'));
    $('#ztop').innerHTML = hol.list && hol.list.length ? `<div class="board"><table class="tbl"><tr><th>seat</th><th>wallet</th><th class="r">weight</th><th class="r">clock</th></tr>${hol.list.slice(0, 6).map(h => `<tr class="c" data-w="${h.w}"><td>#${h.rank}</td><td>${short(h.w)}</td><td class="r">${pct(h.pct)}</td><td class="r">${h.a ? h.a.m.toFixed(2) + 'x' : '—'}</td></tr>`).join('')}</table></div>` : emptyHTML('no snapshot yet', 'The manifest fills up with the first snapshot.');
    $$('#ztop tr.c').forEach(r => r.onclick = () => go('#/pass/' + r.dataset.w));
  };
  const emptyHTML = (t, p) => `<div class="empty"><pre>${esc(A.SPRITE.join('\n'))}</pre><div style="color:#fff">${t}</div><div style="margin-top:6px">${p}</div></div>`;
  function boardHTML(list, mini) { if (!list.length) return emptyHTML('no drops yet', 'The first one lands here, with every transaction linked.');
    return `<div class="board${mini ? ' mini' : ''}">${mini ? '' : '<div class="bh"><span>time</span><span>flight</span><span>cargo</span><span>amount</span><span>wallets</span><span>status</span></div>'}${list.map(d => `<div class="br" data-id="${d.id}"><span class="mut">${when(d.landedAt || d.at)}</span><span class="flap fl-id">${flight(d)}</span><span>${esc(cargoOf(d))}</span><span>${fmt(amtOf(d), d.kind === 'sol' ? 4 : 2)} ${esc(cargoOf(d))}</span><span>${d.wallets}</span><span class="st ${stClass(d.status)}">${esc(d.status)}</span></div>`).join('')}</div>`; }
  function wireBoard(root) { $$('.br', root).forEach(r => r.onclick = () => go('#/d/' + r.dataset.id)); $$('.fl-id', root).forEach((el, i) => { const v = el.textContent; el.textContent = ''; setTimeout(() => A.flap(el, v, { sound: i < 3 }), i * 60); }); }

  V.board = async m => {
    m.innerHTML = `<div class="sec-h"><div><div class="kick">departures · every drop A1R ever sent</div><div class="h2">the board.</div></div><div class="chips" id="chips"><button class="chip on" data-f="all">all</button><button class="chip" data-f="sol">SOL</button><button class="chip" data-f="token">coins</button></div></div><div id="bd">${emptyHTML('loading the board…', '')}</div>
      <p class="mut" style="margin-top:14px;font-size:12px">Every batch of every drop is a transaction from the A1R operator with the memo <span style="color:#fff">a1r:drop:&lt;flight&gt;</span>, and it touches the A1R tag address, so the chain itself is the ledger.</p>`;
    let f = 'all'; const paint = () => { const L = (S.drops || []).filter(d => f === 'all' || d.kind === f); $('#bd').innerHTML = boardHTML(L); wireBoard($('#bd')); };
    $$('#chips .chip').forEach(c => c.onclick = () => { f = c.dataset.f; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === c)); SND.tick(.03, 2200); paint(); });
    await Promise.all([loadDrops(), S.coins ? 0 : loadCoins()]); paint();
  };
  async function dropDrawer(id) {
    openDrawer(`<div class="kick">flight</div><div class="h2" id="dh">loading…</div><div id="db"></div>`);
    let d; try { d = await api('drop', '&id=' + encodeURIComponent(id)); } catch (e) { $('#dh').textContent = 'not found'; $('#db').innerHTML = `<p class="mut" style="margin-top:12px">${esc(e.message)}</p>`; return; }
    if (!S.drops) await loadDrops(); A.flap($('#dh'), flight(d)); const amt = amtOf(d), sigs = d.sigs || [], recips = d.batches.flat().map(([w, v]) => [w, Number(BigInt(v)) / 10 ** d.decimals]).sort((a, b) => b[1] - a[1]);
    $('#db').innerHTML = `<canvas class="replay" id="rp"></canvas><div class="row" style="margin-top:10px"><span class="st ${stClass(d.status)}">${esc(d.status)}</span><button class="chip" id="rpb">replay the drop</button></div>
      <dl class="kv"><dt>cargo</dt><dd>${fmt(amt, 6)} ${esc(cargoOf(d))}${d.mint ? ` · <a class="lk" target="_blank" rel="noopener" href="${solscan('token', d.mint)}">${short(d.mint)}</a>` : ''}</dd><dt>wallets</dt><dd>${d.wallets}${d.skipped ? ` <span class="mut">· ${d.skipped} under the minimum roll over</span>` : ''}</dd>
      <dt>batches</dt><dd>${sigs.filter(Boolean).length} of ${d.batches.length} landed</dd><dt>snapshot</dt><dd>${when(d.snapAt)} UTC</dd><dt>built</dt><dd>${when(d.at)} UTC</dd><dt>landed</dt><dd>${d.landedAt ? when(d.landedAt) + ' UTC' : '—'}</dd><dt>operator</dt><dd><a class="lk" target="_blank" rel="noopener" href="${solscan('account', d.from)}">${short(d.from, 6)}</a></dd></dl>
      <div class="kick" style="margin-top:20px">batches</div><table class="tbl" style="margin-top:6px">${d.batches.map((b, k) => `<tr><td>${k + 1}/${d.batches.length}</td><td>${b.length} wallets</td><td class="r">${sigs[k] ? `<a class="lk" target="_blank" rel="noopener" href="${solscan('tx', sigs[k])}">${short(sigs[k], 6)} ↗</a>` : '<span class="mut">not sent</span>'}</td><td class="r vf" data-k="${k}"></td></tr>`).join('')}</table>
      <div class="row" style="margin-top:12px"><button class="btn" id="verify">verify on chain</button><button class="btn" id="csv">download csv</button><button class="btn" id="shd">share</button><span class="mut" id="vmsg" style="font-size:12px"></span></div>
      <div class="kick" style="margin-top:24px">who got what</div><input id="rq" placeholder="find a wallet" style="width:100%;margin:8px 0">
      <table class="tbl" id="rt"></table>`;
    const paintR = q => { $('#rt').innerHTML = `<tr><th>wallet</th><th class="r">amount</th></tr>` + recips.filter(r => !q || r[0].toLowerCase().includes(q.toLowerCase())).slice(0, 400).map(([w, v]) => `<tr class="c" data-w="${w}"><td>${short(w, 6)}</td><td class="r">${fmt(v, 6)}</td></tr>`).join(''); $$('#rt tr.c').forEach(r => r.onclick = () => { closeDrawer(); go('#/pass/' + r.dataset.w); }); };
    paintR(''); $('#rq').oninput = e => paintR(e.target.value.trim());
    $('#csv').onclick = () => { const rows = ['wallet,amount,cargo', ...recips.map(([w, v]) => `${w},${v},${cargoOf(d)}`)]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = `a1r-${flight(d).toLowerCase()}.csv`; a.click(); SND.blip(990, .03); };
    $('#shd').onclick = () => open('https://x.com/intent/post?text=' + encodeURIComponent(`${flight(d)} ${d.status === 'landed' ? 'landed' : d.status}: ${fmt(amt, 4)} ${cargoOf(d)} to ${d.wallets} wallets.\n\nthe airdrop they promised us.\n${location.origin}/#/d/${d.id}`), '_blank', 'noopener'); const rp = () => replay($('#rp'), recips, d); rp(); $('#rpb').onclick = rp;
    if (WL.pk && S.status && WL.pk === S.status.operator && d.status !== 'landed' && d.status !== 'scrubbed') { $('#db').insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:20px"><div class="kick">operator</div><p class="mut" style="margin:8px 0 12px;font-size:12.5px">${(d.sigs || []).some(Boolean) ? 'Part of this flight is still on the ground. Resume finds every batch that already landed on-chain, then rebuilds only the rest.' : 'This flight never left. Fly it, or scrub it from the board.'}</p><div class="row"><button class="btn" id="rsm">resume the flight</button>${(d.sigs || []).some(Boolean) ? '' : '<button class="btn" id="scr">scrub</button>'}</div><div class="log" id="l-rs"></div></div>`);
      const lg = t => { $('#l-rs').textContent = t; }; $('#rsm').onclick = async () => { try { lg('checking the chain…'); const r = await post('resume', { from: WL.pk, id: d.id }); if (!r.txs.length) { lg('every batch already landed.'); return; } const sg = await signSend(r.txs, lg); const okS = sg.filter(Boolean); lg('waiting for the chain…'); let x = null; for (let i = 0; i < 12; i++) { await new Promise(z => setTimeout(z, 3000)); try { x = await post('landed', { id: d.id, sigs: okS }); if (x.status === 'landed') break; } catch (e) { } } lg(x ? `${x.status}: ${x.landed} of ${x.of}` : 'sent; check again in a minute'); await loadDrops(); SND.chime(); } catch (e) { lg('stopped: ' + e.message); } };
      if ($('#scr')) $('#scr').onclick = async () => { try { const msg = `a1r: scrub ${d.id} at ${Date.now()}`; lg('sign the message…'); await post('scrub', { msg, sig: await signMsg(msg) }); lg('scrubbed.'); await loadDrops(); } catch (e) { lg('stopped: ' + e.message); } }; }
    $('#verify').onclick = async () => { $('#vmsg').textContent = 'reading every batch from the chain…'; try { const v = await api('verify', '&id=' + encodeURIComponent(d.id)); $$('.vf').forEach(td => { const r = v.batches[+td.dataset.k]; td.innerHTML = r === 'ok' ? '<span class="tag ok">✓ on-chain</span>' : `<span class="tag">${esc(r)}</span>`; });
      $('#vmsg').textContent = v.ok === v.of ? 'every batch is on-chain, succeeded, signed by the operator, with this flight\'s memo.' : `${v.ok} of ${v.of} batches check out so far.`; SND.chime(); } catch (e) { $('#vmsg').textContent = e.message; } };
  }

  // a drop, replayed: one crate per wallet falls onto its bar, biggest first
  function replay(cv, recips, d) { if (!cv) return; const g = cv.getContext('2d'), D = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight; cv.width = W * D; cv.height = H * D; g.setTransform(D, 0, 0, D, 0, 0);
    const L = recips.slice(0, 64), max = L.length ? L[0][1] : 1, n = L.length, bw = W / Math.max(1, n), t0 = performance.now(), dur = 2600, id = (cv._id = (cv._id || 0) + 1);
    const step = now => { if (cv._id !== id || !cv.isConnected) return; const t = now - t0; g.clearRect(0, 0, W, H); g.font = '9px JB, monospace'; g.textBaseline = 'top';
      L.forEach(([w, v], i) => { const start = i / n * dur * .7, k = A.clamp((t - start) / 520), h = Math.max(2, (H - 46) * Math.sqrt(v / max)), x = i * bw + bw / 2, y0 = H - 4;
        g.fillStyle = `rgba(255,255,255,${k >= 1 ? .85 : .12})`; g.fillRect(x - bw * .3, y0 - (k >= 1 ? h : 2), bw * .6, k >= 1 ? h : 2);
        if (k > 0 && k < 1) { const y = -14 + (y0 - h - 6) * A.ease(k); g.fillStyle = '#fff'; g.fillText(d.kind === 'sol' ? '◎' : '$', x - 3, y); if (Math.random() < .25) SND.tick(.008, 3000 + i * 20); } });
      if (t < dur + 600) requestAnimationFrame(step); };
    requestAnimationFrame(step); }

  // ---------------------------------------------------------------- the boarding pass
  const klass = r => !r ? 'STANDBY' : r <= 10 ? 'FIRST' : r <= 100 ? 'BUSINESS' : 'ECONOMY';
  function barcode(cv, seed) { const g = cv.getContext('2d'), W = cv.width = cv.clientWidth * 2, H = cv.height = cv.clientHeight * 2; g.fillStyle = '#0b0b0b'; let x = 0, h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    while (x < W) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; const w = 2 + (Math.abs(h) % 7), gap = 2 + (Math.abs(h >> 3) % 5); g.fillRect(x, 0, w, H); x += w + gap; } }
  V.pass = async (m, arg) => {
    const w = arg || WL.pk || '';
    m.innerHTML = `<div class="passw"><div class="tc"><div class="kick">boarding pass</div><div class="h2" style="margin-top:6px">check any wallet.</div></div>
      <form class="lookup" id="lk"><input id="lw" placeholder="paste a Solana wallet" value="${esc(w)}" spellcheck="false" autocomplete="off"><button class="btn pri">check</button>${WL.pk ? '' : '<button type="button" class="btn" id="lc">connect</button>'}</form><div id="pv" style="width:100%;display:grid;justify-items:center;gap:18px"></div></div>`;
    $('#lk').onsubmit = e => { e.preventDefault(); const v = $('#lw').value.trim(); if (v) go('#/pass/' + v); };
    if ($('#lc')) $('#lc').onclick = async () => { const k = await connect(); if (k) go('#/pass/' + k); };
    if (!w) { $('#pv').innerHTML = passHTML({ w: null }); return; }
    $('#pv').innerHTML = `<div class="mut">reading ${short(w)}…</div>`;
    let v; try { v = await api('wallet', '&w=' + encodeURIComponent(w)); } catch (e) { $('#pv').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!S.drops) loadDrops(); if (!S.coins) await loadCoins(); if (!S.hold) S.hold = await api('hold').catch(() => null);
    $('#pv').innerHTML = passHTML(v); const bc = $('#bc'); if (bc) barcode(bc, v.w); const bar = $('.pass .bar i'); if (bar) requestAnimationFrame(() => bar.style.width = bar.dataset.w);
    $$('.pass [data-flap]').forEach((el, i) => setTimeout(() => A.flap(el, el.dataset.flap, { sound: i < 2 }), 150 + i * 70)); SND.whoosh(.5, .05, true);
    $('#dl') && ($('#dl').onclick = () => downloadPass(v)); $('#sh') && ($('#sh').onclick = () => { const e = v.entry, t = e ? `my A1R boarding pass: seat #${e.rank}, ${klass(e.rank).toLowerCase()} class, clock at ${e.a ? e.a.m.toFixed(2) : '1.00'}x.\n\nthe airdrop they promised us.` : 'on standby for the airdrop they promised us.'; open('https://x.com/intent/post?text=' + encodeURIComponent(t + '\n' + location.origin), '_blank', 'noopener'); });
  };
  function passHTML(v) {
    const e = v.entry, s = S.status || {}, r = v.received || { sol: 0, tok: {}, drops: [] }, held = e && e.a ? days(e.a.since) : 0, mult = e && e.a ? e.a.m : 1, max = (s.rules && s.rules.maxMult) || 3, md = (s.rules && s.rules.multDays) || 14;
    const from = v.w ? v.w.slice(0, 3).toUpperCase() : '???', live = v.live ? Object.entries(v.live).filter(([, x]) => x > 0) : [];
    const coinsHeld = e ? (e.a ? 1 : 0) + Object.keys(e.f || {}).length : live.length, gotTok = Object.keys(r.tok || {}).length;
    const note = !s.mint && !(s.fleet || []).length ? 'A1R is not live yet. Passes open when $A1R launches.' : !v.w ? 'Paste a wallet, or connect one.' : e ? '' : live.length ? 'You hold our coins: your clock starts at the next snapshot (every 10 minutes).' : `Hold $A1R or one of our coins (at least ${((s.rules || {}).minHoldPct ?? .01)}% of a coin) to get a seat.`;
    return `<div class="pass"><div class="m"><div class="top"><b>A1R</b><span>boarding pass</span></div>
      <div class="route"><div class="c">${esc(from)}<small>${v.w ? short(v.w, 5) : 'your wallet'}</small></div><div class="p"></div><div class="c">A1R<small>the drop zone</small></div></div>
      <div class="f"><div>seat<b data-flap="${e ? '#' + e.rank : '—'}"></b></div><div>class<b data-flap="${klass(e && e.rank)}"></b></div><div>weight<b>${e ? pct(e.pct, 3) : '—'}</b></div><div>coins held<b>${coinsHeld}</b></div>
        <div>flights<b>${r.drops.length}</b></div><div>SOL received<b>${fmt(r.sol, 4)}</b></div><div>coins received<b>${gotTok}</b></div><div>gate<b>next launch</b></div></div>
      <div class="clock"><div class="f" style="grid-template-columns:1fr auto"><div>clock · ${held >= md ? held.toFixed(1) + ' days held · full' : held.toFixed(1) + ' of ' + md + ' days held'}</div><div style="text-align:right">${mult.toFixed(2)}x of ${max}x</div></div><div class="bar"><i style="width:0" data-w="${Math.min(100, (mult - 1) / (max - 1) * 100)}%"></i></div></div>
      ${e ? '' : '<div class="standby">STANDBY</div>'}</div>
      <div class="s"><div><div class="k">passenger</div><div class="v" style="font-size:18px">${v.w ? short(v.w, 4) : '—'}</div></div><canvas class="bc" id="bc"></canvas><div><div class="k">boarding</div><div class="v">any time</div></div></div></div>
      ${note ? `<div class="mut tc" style="max-width:620px">${esc(note)}</div>` : ''}${e && S.hold && S.hold.usd > 0 ? `<div class="pill">your slice of what's in the hold now <b>≈ $${fmt(S.hold.usd * e.pct, 2)}</b> <span class="dim">· an estimate, the snapshot at drop time decides</span></div>` : ''}
      ${v.w ? `<div class="row" style="justify-content:center"><button class="btn" id="dl">download pass</button><button class="btn" id="sh">share on X</button><a class="btn" target="_blank" rel="noopener" href="${solscan('account', v.w)}">wallet on solscan ↗</a></div>` : ''}
      ${v.w ? holdsHTML(v) : ''}`; }
  function holdsHTML(v) { const e = v.entry, s = S.status || {}, r = v.received || { drops: [] }, rows = [];
    const name = mint => { const c = (S.coins || []).find(x => x.mint === mint); return c ? (c.symbol ? '$' + c.symbol : c.name) : short(mint); };
    if (e && e.a) rows.push([s.mint, '$A1R', e.a.ui, e.a.sh, e.a.since, e.a.m, '1x']); if (e) for (const [mint, x] of Object.entries(e.f || {})) rows.push([mint, name(mint), x.ui, x.sh, x.since, x.m, ((s.rules || {}).fleetWeight || .25) + 'x']);
    if (!e && v.live) for (const [mint, ui] of Object.entries(v.live)) rows.push([mint, mint === s.mint ? '$A1R' : name(mint), ui, null, null, null, mint === s.mint ? '1x' : ((s.rules || {}).fleetWeight || .25) + 'x']);
    const dropsL = (S.drops || []).filter(d => (r.drops || []).includes(d.id));
    return `<div class="holds grid2"><div class="card"><div class="kick">what you hold</div>${rows.length ? `<table class="tbl" style="margin-top:8px"><tr><th>coin</th><th class="r">amount</th><th class="r">of supply</th><th class="r">held</th><th class="r">clock</th><th class="r">counts</th></tr>${rows.map(x => `<tr><td>${esc(x[1])}</td><td class="r">${fmt(x[2])}</td><td class="r">${x[3] == null ? '—' : pct(x[3], 3)}</td><td class="r">${x[4] ? days(x[4]).toFixed(1) + 'd' : '—'}</td><td class="r">${x[5] ? x[5].toFixed(2) + 'x' : '—'}</td><td class="r">${x[6]}</td></tr>`).join('')}</table>` : '<p class="mut" style="margin-top:10px">None of our coins in this wallet yet.</p>'}</div>
      <div class="card"><div class="kick">flights you were on</div>${dropsL.length ? `<table class="tbl" style="margin-top:8px">${dropsL.map(d => `<tr class="c" data-id="${d.id}"><td>${flight(d)}</td><td>${esc(cargoOf(d))}</td><td class="r">${when(d.landedAt || d.at)}</td></tr>`).join('')}</table>` : '<p class="mut" style="margin-top:10px">No drops for this wallet yet. Every drop it is on shows up here.</p>'}</div></div>`; }
  function downloadPass(v) { const e = v.entry, c = document.createElement('canvas'), W = 1600, H = 640; c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const r = 34, x0 = 60, y0 = 60, w = W - 120, h = H - 120; g.fillStyle = '#ececec'; g.beginPath(); g.roundRect(x0, y0, w, h, r); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(x0 + w - 380, y0, 22, 0, 7); g.arc(x0 + w - 380, y0 + h, 22, 0, 7); g.fill(); g.setLineDash([12, 12]); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + w - 380, y0 + 30); g.lineTo(x0 + w - 380, y0 + h - 30); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#0b0b0b'; g.font = '700 46px ID'; g.fillText('A1R', x0 + 50, y0 + 80); g.font = '400 20px JB'; g.fillStyle = '#555'; g.fillText('BOARDING PASS · THE AIRDROP THEY PROMISED US', x0 + 200, y0 + 74);
    g.fillStyle = '#0b0b0b'; g.font = '700 110px ID'; g.fillText(v.w.slice(0, 3).toUpperCase(), x0 + 50, y0 + 230); g.fillText('A1R', x0 + 640, y0 + 230); g.font = '400 40px JB'; g.fillText('✈', x0 + 470, y0 + 200);
    const F = [['SEAT', e ? '#' + e.rank : '—'], ['CLASS', klass(e && e.rank)], ['WEIGHT', e ? pct(e.pct, 3) : '—'], ['CLOCK', (e && e.a ? e.a.m.toFixed(2) : '1.00') + 'x'], ['FLIGHTS', String((v.received || { drops: [] }).drops.length)], ['SOL IN', fmt((v.received || {}).sol || 0, 4)]];
    F.forEach(([k, val], i) => { const x = x0 + 50 + (i % 3) * 300, y = y0 + 320 + Math.floor(i / 3) * 110; g.font = '400 20px JB'; g.fillStyle = '#555'; g.fillText(k, x, y); g.font = '400 40px JB'; g.fillStyle = '#0b0b0b'; g.fillText(val, x, y + 50); });
    g.font = '400 20px JB'; g.fillStyle = '#555'; g.fillText('PASSENGER', x0 + w - 330, y0 + 80); g.font = '400 32px JB'; g.fillStyle = '#0b0b0b'; g.fillText(short(v.w, 5), x0 + w - 330, y0 + 124);
    let hh = 2166136261; for (const ch of v.w) { hh ^= ch.charCodeAt(0); hh = Math.imul(hh, 16777619); } let x = x0 + w - 330; while (x < x0 + w - 50) { hh ^= hh << 13; hh ^= hh >>> 17; hh ^= hh << 5; const bw = 3 + Math.abs(hh) % 9; g.fillRect(x, y0 + 190, bw, 200); x += bw + 3 + Math.abs(hh >> 3) % 6; }
    g.font = '400 20px JB'; g.fillStyle = '#555'; g.fillText(location.host, x0 + w - 330, y0 + h - 50);
    const a = document.createElement('a'); a.download = `a1r-pass-${v.w.slice(0, 6)}.png`; a.href = c.toDataURL('image/png'); a.click(); SND.chime(); }

  // ---------------------------------------------------------------- radar
  let radarStop = null;
  V.radar = async m => {
    m.innerHTML = `<div class="sec-h"><div><div class="kick">radar · every wallet on the manifest</div><div class="h2">who's holding.</div></div><span class="pill" id="rs">snapshot <b>—</b></span></div>
      <div class="radar"><div class="scope" id="scope"><canvas></canvas><div class="tip" id="tip"></div></div><div><input id="rq" placeholder="find a wallet" style="width:100%;margin-bottom:10px"><div class="list" id="rl"></div></div></div>`;
    const h = await loadHolders(300); if (!$('#scope')) return; $('#rs').innerHTML = `snapshot <b>${h.at ? ago(h.at) : 'not yet'}</b> · <b>${h.eligible || 0}</b> on the manifest`;
    const L = h.list || [], paintL = q => { const F = L.filter(x => !q || x.w.toLowerCase().includes(q.toLowerCase())).slice(0, 300); $('#rl').innerHTML = F.length ? `<table class="tbl"><tr><th>seat</th><th>wallet</th><th class="r">weight</th><th class="r">clock</th></tr>${F.map(x => `<tr class="c" data-w="${x.w}"><td>#${x.rank}</td><td>${short(x.w)}</td><td class="r">${pct(x.pct)}</td><td class="r">${x.a ? x.a.m.toFixed(2) + 'x' : (Object.values(x.f || {})[0] || {}).m ? (Object.values(x.f)[0].m).toFixed(2) + 'x' : '—'}</td></tr>`).join('')}</table>` : `<div class="empty" style="border:0">${L.length ? 'no match' : h.at ? 'nobody on the manifest yet.' : 'no snapshot yet. the radar lights up with the first one.'}</div>`; $$('#rl tr.c').forEach(r => r.onclick = () => go('#/pass/' + r.dataset.w)); };
    paintL(''); $('#rq').oninput = e => paintL(e.target.value.trim());
    radarStop = radarScope($('#scope'), L);
  };
  function radarScope(el, L) { const cv = $('canvas', el), g = cv.getContext('2d'), tip = $('#tip'); let W, D, raf = 0, alive = true, hover = null; const max = Math.max(1e-9, ...L.map(x => x.pct));
    const hashA = w => { let h = 2166136261; for (const c of w) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) / 4294967296) * Math.PI * 2; };
    const B = L.slice(0, 300).map((x, i) => ({ x, a: hashA(x.w), r: .1 + .86 * Math.sqrt(i / Math.max(1, L.length)), s: 2.2 + 7 * Math.sqrt(x.pct / max) }));
    const size = () => { D = Math.min(devicePixelRatio || 1, 2); W = el.clientWidth; cv.width = cv.height = W * D; };
    const loop = now => { if (!alive) return; raf = requestAnimationFrame(loop); const R = W / 2, sw = (now / 1000 * 1.05) % (Math.PI * 2); g.setTransform(D, 0, 0, D, 0, 0); g.clearRect(0, 0, W, W);
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; for (let i = 1; i <= 4; i++) { g.beginPath(); g.arc(R, R, R * i / 4.2, 0, 7); g.stroke(); } g.beginPath(); g.moveTo(R, 0); g.lineTo(R, W); g.moveTo(0, R); g.lineTo(W, R); g.stroke();
      const grd = g.createConicGradient ? g.createConicGradient(sw - .7, R, R) : null; if (grd) { grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(.11, 'rgba(255,255,255,.12)'); grd.addColorStop(.111, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.beginPath(); g.arc(R, R, R, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(R, R); g.lineTo(R + Math.cos(sw) * R, R + Math.sin(sw) * R); g.stroke();
      for (const b of B) { const x = R + Math.cos(b.a) * b.r * R * .95, y = R + Math.sin(b.a) * b.r * R * .95; let d = (sw - b.a) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; const lit = Math.exp(-d * 1.6); b.px = x; b.py = y;
        g.fillStyle = `rgba(255,255,255,${(.18 + .82 * lit).toFixed(3)})`; g.beginPath(); g.arc(x, y, b.s * (hover === b ? 1.6 : 1), 0, 7); g.fill(); if (b.x.rank <= 3) { g.font = '10px JB'; g.fillText('#' + b.x.rank, x + b.s + 4, y + 3); } }
      g.fillStyle = '#fff'; g.font = '700 11px JB'; g.textAlign = 'center'; g.fillText('A1R', R, R + 4); g.textAlign = 'left'; };
    el.onpointermove = e => { const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; let best = null, bd = 18; for (const b of B) { const d = Math.hypot(b.px - mx, b.py - my); if (d < bd) { bd = d; best = b; } }
      if (best !== hover) { hover = best; if (best) SND.tick(.015, 3000); } tip.style.opacity = best ? 1 : 0; if (best) { tip.style.left = best.px + 'px'; tip.style.top = best.py + 'px'; tip.textContent = `#${best.x.rank} · ${short(best.x.w)} · ${pct(best.x.pct)}`; } el.style.cursor = best ? 'pointer' : ''; };
    el.onclick = () => { if (hover) go('#/pass/' + hover.x.w); };
    addEventListener('resize', size); size(); raf = requestAnimationFrame(loop); return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); }; }

  // ---------------------------------------------------------------- fleet
  V.fleet = async m => {
    m.innerHTML = `<div class="sec-h"><div><div class="kick">the fleet · coins that put you on the manifest</div><div class="h2">our coins.</div></div></div><div id="fl" class="grid3">${emptyHTML('loading the fleet…', '')}</div>
      <div class="sec"><div class="sec-h"><div><div class="kick">launches</div><div class="h2">cargo for the next drops.</div></div></div><div id="ln"></div></div>`;
    const [coins] = await Promise.all([loadCoins(), S.status ? 0 : loadStatus()]); if (!$('#fl')) return; const s = S.status || {};
    $('#fl').innerHTML = coins.length ? coins.map(c => `<div class="card coin"><span class="tag ${c.a1r ? 'ok' : ''} ws">counts ${c.weight}x</span><div class="hd">${c.icon ? `<img src="${esc(c.icon)}" alt="" loading="lazy">` : `<div class="ph">${esc((c.symbol || c.name || '?')[0])}</div>`}<div><div class="nm">${esc(c.name || '—')}</div><div class="mut">${c.symbol ? '$' + esc(c.symbol) : short(c.mint)}</div></div></div>
      <dl class="kv"><dt>market cap</dt><dd>${usd(c.mcap)}</dd><dt>24h</dt><dd>${c.ch24 == null ? '—' : (c.ch24 >= 0 ? '+' : '') + c.ch24.toFixed(1) + '%'}</dd><dt>holders</dt><dd>${fmt(c.snapHolders ?? c.holders, 0)}</dd></dl>
      <div class="row"><a class="btn" style="height:34px;padding:0 12px;font-size:12px" target="_blank" rel="noopener" href="https://dexscreener.com/solana/${c.mint}">chart ↗</a><a class="btn" style="height:34px;padding:0 12px;font-size:12px" target="_blank" rel="noopener" href="https://pump.fun/coin/${c.mint}">pump.fun ↗</a><button class="btn" style="height:34px;padding:0 12px;font-size:12px" data-cp="${c.mint}">copy CA</button></div></div>`).join('')
      : `<div style="grid-column:1/-1">${emptyHTML('the fleet is empty for now', s.mint ? 'Our other coins show up here once they are added.' : '$A1R leads the fleet once it launches. Our other coins join it here.')}</div>`;
    $$('[data-cp]').forEach(b => b.onclick = () => copy(b.dataset.cp, 'Contract address'));
    const L = s.launches || [], idx = S.drops || await loadDrops();
    $('#ln').innerHTML = L.length ? `<div class="board"><table class="tbl"><tr><th>launched</th><th>coin</th><th>contract</th><th class="r">status</th></tr>${L.map(x => { const dropped = idx.find(d => d.mint === x.mint && d.status !== 'boarding'); return `<tr><td>${when(x.at)}</td><td>${esc(x.name || x.symbol || '—')}</td><td><a class="lk" target="_blank" rel="noopener" href="https://pump.fun/coin/${x.mint}">${short(x.mint)}</a></td><td class="r"><span class="st ${dropped ? 'landed' : 'boarding'}">${dropped ? 'dropped' : 'set aside'}</span></td></tr>`; }).join('')}</table></div>` : emptyHTML('no launches yet', 'Every coin we launch is listed here with its dev buy set aside for the drop.');
  };

  // ---------------------------------------------------------------- how (the rules, and a calculator)
  V.how = async m => { const s = S.status || {}, R = s.rules || { fleetWeight: .25, maxMult: 3, multDays: 14, sellReset: .98, minHoldPct: .01, maxRecipients: 400, minSol: .0005, snapEveryMin: 10 };
    m.innerHTML = `<div class="rules"><nav>${['the idea', 'who gets a seat', 'your weight', 'your clock', 'a drop', 'the proof', 'calculator', 'what A1R is not'].map((t, i) => `<a href="javascript:void 0" data-j="r${i}">${t}</a>`).join('')}</nav><article>
      <h3 id="r0">the idea.</h3><p>On 9 July 2025, pump.fun said an airdrop was "coming soon". ${DAYS_SINCE()} days later, it hasn't come. A1R is the airdrop we built ourselves: every coin we launch drops a slice of itself to the people who hold $A1R and our coins.</p>
      <h3 id="r1">who gets a seat.</h3><ul><li>Every wallet holding at least ${R.minHoldPct}% of the supply of $A1R or of one of our coins.</li><li>A1R reads holders straight from the chain every ${R.snapEveryMin} minutes. Pools, bonding curves and other program accounts are left out, and so is the A1R operator.</li><li>No sign-up, no claim. If you hold, you're on the manifest.</li></ul>
      <h3 id="r2">your weight.</h3><div class="formula">weight = ( your share of $A1R × your $A1R clock ) + ${R.fleetWeight} × Σ ( your share of each of our coins × its clock )</div><p>$A1R counts ${1 / R.fleetWeight}x more than our other coins. Your slice of a drop is your weight divided by everyone's weight.</p>
      <h3 id="r3">your clock.</h3><ul><li>Your clock starts the first time A1R sees you holding. It climbs from 1x to ${R.maxMult}x over ${R.multDays} days.</li><li>Sell more than ${Math.round((1 - R.sellReset) * 100)}% of a coin and that coin's clock starts again. Buying more never resets it.</li></ul>
      <h3 id="r4">a drop.</h3><ul><li>When we launch a coin, its dev buy is set aside. That is the cargo.</li><li>$A1R's own creator fees drop too, as SOL.</li><li>The A1R operator signs the drop in its own wallet: batches of transfers, straight into the wallets on the manifest, up to ${R.maxRecipients} per drop, heaviest first.</li><li>Slices smaller than ${R.minSol} SOL (or a tiny share of a coin) roll over to the next drop. Sending a coin to a wallet that never held it costs about 0.002 SOL in rent, and A1R pays it.</li></ul>
      <h3 id="r5">the proof.</h3><p>Every batch carries the memo <span style="color:#fff">a1r:drop:&lt;flight&gt;</span>, is signed by the operator${s.operator ? ` (<a class="lk" target="_blank" rel="noopener" href="${solscan('account', s.operator)}">${short(s.operator, 5)}</a>)` : ''} and touches the A1R tag address (<a class="lk" target="_blank" rel="noopener" href="${solscan('account', s.tag || '')}">${short(s.tag || '', 5)}</a>). Open any flight on the board and press "verify on chain".</p>
      <h3 id="r6">calculator.</h3><div class="card"><div class="calc"><label>your share of $A1R <span id="cv1"></span><input type="range" id="c1" min="0" max="3" step="0.01" value="0.5"></label><label>days held <span id="cv2"></span><input type="range" id="c2" min="0" max="30" step="1" value="7"></label><label>drop size (SOL) <span id="cv3"></span><input type="range" id="c3" min="0.1" max="50" step="0.1" value="5"></label>
        <div class="res"><div><span class="kick">your clock</span><b id="r1v">—</b></div><div><span class="kick">your weight</span><b id="r2v">—</b></div><div><span class="kick">your slice</span><b id="r3v">—</b></div><div><span class="kick">of the drop</span><b id="r4v">—</b></div></div></div><p class="mut" style="font-size:12px;margin-top:10px" id="cnote"></p></div>
      <h3 id="r7">what A1R is not.</h3><ul><li>Not affiliated with pump.fun. Their airdrop is theirs to give.</li><li>Not a promise of value. Drops depend on our launches and on fees; a memecoin can go to zero.</li><li>A1R never asks for your keys and never needs a claim. Anything asking you to "claim A1R" is not us.</li><li>Nothing here is financial advice.</li></ul></article></div>`;
    $$('.rules nav a').forEach(a => a.onclick = () => $('#' + a.dataset.j).scrollIntoView({ behavior: 'smooth', block: 'start' }));
    const h = S.holders || await loadHolders(300); const total = h && h.total || 0;
    const calc = () => { const sh = +$('#c1').value / 100, d = +$('#c2').value, size = +$('#c3').value, mult = 1 + (R.maxMult - 1) * Math.min(1, d / R.multDays), wt = sh * mult, slice = total ? wt / (total + wt) : null;
      $('#cv1').textContent = (+$('#c1').value).toFixed(2) + '%'; $('#cv2').textContent = d + 'd'; $('#cv3').textContent = size + ' SOL'; $('#r1v').textContent = mult.toFixed(2) + 'x'; $('#r2v').textContent = wt.toFixed(5); $('#r3v').textContent = slice == null ? '—' : fmt(size * slice, 4) + ' SOL'; $('#r4v').textContent = slice == null ? '—' : pct(slice);
      $('#cnote').textContent = total ? `Against the current manifest (total weight ${total.toFixed(4)}, ${h.eligible} wallets). The real slice depends on who holds at the next snapshot.` : 'Your slice shows here once the first snapshot exists; until then this shows your clock and weight only.'; };
    ['c1', 'c2', 'c3'].forEach(id => $('#' + id).oninput = () => { calc(); SND.tick(.01, 2600); }); calc(); };

  // ---------------------------------------------------------------- ops (the operator's console)
  V.ops = async m => { await loadStatus(); const s = S.status || {}, op = s.operator, isOp = WL.pk && op && WL.pk === op;
    const chk = (ok, t) => `<div class="chk"><i class="${ok ? 'y' : ''}"></i>${t}</div>`;
    m.innerHTML = `<div class="sec-h"><div><div class="kick">operator console</div><div class="h2">the cockpit.</div></div>${WL.pk ? `<span class="pill">${isOp ? '<b>operator</b> connected' : 'connected: ' + short(WL.pk) + ' · not the operator'}</span>` : '<button class="btn pri" id="oc">connect the operator wallet</button>'}</div>
      <div class="grid2"><div class="card"><div class="kick">preflight</div>${chk(s.storage, 'storage is switched on')}${chk(!!s.mint, s.mint ? '$A1R mint: ' + short(s.mint, 6) : '$A1R mint is not set (A1R_MINT)')}${chk(!!op, op ? 'operator: ' + short(op, 6) : 'operator wallet is not set (A1R_OPERATOR)')}${chk(!!s.snapAt && Date.now() - s.snapAt < 6 * 3600e3, s.snapAt ? 'snapshot ' + ago(s.snapAt) + ' · ' + s.eligible + ' on the manifest' : 'no snapshot yet')}${chk(isOp, isOp ? 'you are the operator' : 'connect the operator wallet to fly')}</div>
        <div class="card"><div class="kick">what this page does</div><p class="mut" style="margin-top:8px">Every action here is a transaction or a message the A1R operator signs in its own wallet. Nothing is signed on a server. Anyone can open this page; only the operator wallet can fly.</p></div></div>
      <div class="ops" style="margin-top:16px">
        <div class="card"><h4>1 · take a snapshot</h4><p>Read every holder of $A1R and our coins now, and update everyone's clock.</p><button class="btn" data-op="snap" ${isOp ? '' : 'disabled'}>snapshot now</button><div class="log" id="l-snap"></div></div>
        <div class="card"><h4>2 · claim $A1R creator fees</h4><p>Pull $A1R's pump.fun creator fees into the operator wallet. They become the next SOL drop.</p><button class="btn" data-op="claim" ${isOp ? '' : 'disabled'}>claim fees</button><div class="log" id="l-claim"></div></div>
        <div class="card"><h4>3 · drop SOL</h4><p>Split SOL across the manifest by weight.</p><div class="row"><input id="solAmt" type="number" min="0" step="0.01" placeholder="SOL" style="width:140px"><button class="btn" data-op="dropsol" ${isOp ? '' : 'disabled'}>build the drop</button></div><div class="log" id="l-dropsol"></div></div>
        <div class="card"><h4>4 · drop a coin</h4><p>Drop a coin the operator holds, like the dev buy of a launch.</p><div class="row"><select id="tokSel" style="min-width:200px"><option value="">${isOp ? 'loading holdings…' : 'connect the operator'}</option></select><input id="tokAmt" type="number" min="0" step="any" placeholder="amount" style="width:150px"><button class="btn" id="tokMax" type="button" ${isOp ? '' : 'disabled'}>max</button><button class="btn" data-op="droptok" ${isOp ? '' : 'disabled'}>build the drop</button></div><div class="log" id="l-droptok"></div></div>
        <div class="card"><h4>5 · register a launch</h4><p>Put a new coin on the fleet page as cargo for the next drop.</p><div class="row"><input id="lnMint" placeholder="mint" style="flex:1"><input id="lnName" placeholder="name" style="width:140px"><button class="btn" data-op="launch" ${isOp ? '' : 'disabled'}>register</button></div><div class="log" id="l-launch"></div></div>
        <div class="card"><h4>6 · add a coin to the fleet</h4><p>Its holders join the manifest at ${(s.rules || {}).fleetWeight || .25}x.</p><div class="row"><input id="flMint" placeholder="mint" style="flex:1"><input id="flName" placeholder="name" style="width:140px"><button class="btn" data-op="fleet" ${isOp ? '' : 'disabled'}>add</button><button class="btn" data-op="fleetrm" ${isOp ? '' : 'disabled'}>remove</button></div><div class="log" id="l-fleet"></div></div>
        <div class="card" style="grid-column:1/-1"><h4>7 · launch a coin on pump.fun</h4><p>One signature launches the coin with a dev buy. The dev buy stays in the operator wallet as the cargo for its drop, and the coin joins the fleet, so its holders join the manifest.</p>
          <div class="lgrid"><input id="lpName" placeholder="name" maxlength="32"><input id="lpSym" placeholder="ticker" maxlength="10"><input id="lpDev" type="number" min="0.01" max="20" step="0.01" placeholder="dev buy, SOL"><label class="file"><input id="lpImg" type="file" accept="image/png,image/jpeg,image/gif,image/webp"><span id="lpImgL">image</span></label>
            <input id="lpX" placeholder="https://x.com/…"><input id="lpWeb" placeholder="https://…"><textarea id="lpDesc" placeholder="description" maxlength="500"></textarea></div>
          <div class="row" style="margin-top:12px"><button class="btn" data-op="pump" ${isOp ? '' : 'disabled'}>launch</button><label class="mut" style="font-size:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="lpSim" style="width:auto"> dry run: build and simulate, send nothing</label></div><div class="log" id="l-pump"></div></div></div>`;
    $('#lpImg').onchange = e => { const f = e.target.files[0]; $('#lpImgL').textContent = f ? f.name.slice(0, 24) : 'image'; };
    if ($('#oc')) $('#oc').onclick = async () => { await connect(); };
    const log = (k, t) => { const el = $('#l-' + k); if (el) el.textContent = t; };
    let H = null; if (isOp) { api('holdings', '&w=' + op).then(h => { H = h; $('#tokSel').innerHTML = h.tokens.length ? h.tokens.map(t => `<option value="${t.mint}">${t.symbol ? '$' + esc(t.symbol) : short(t.mint)} · ${fmt(t.ui)}</option>`).join('') : '<option value="">no coins in the operator wallet</option>'; }).catch(e => { $('#tokSel').innerHTML = `<option value="">${esc(e.message)}</option>`; }); }
    $('#tokMax').onclick = () => { const t = H && H.tokens.find(x => x.mint === $('#tokSel').value); if (t) $('#tokAmt').value = t.ui; };
    const fly = async (k, planBody) => { log(k, 'building the drop…'); const p = await post('plan', planBody); log(k, `flight ready: ${p.wallets} wallets in ${p.batches} batches${p.skipped ? `, ${p.skipped} under the minimum roll over` : ''}.\nsign every batch in your wallet…`);
      const sigs = await signSend(p.txs, t => log(k, t)); const ok = sigs.filter(Boolean); if (!ok.length) throw new Error('no batch was sent');
      log(k, `${ok.length} of ${sigs.length} batches sent. waiting for the chain…`); let r = null; for (let i = 0; i < 12; i++) { await new Promise(z => setTimeout(z, 3000)); try { r = await post('landed', { id: p.id, sigs: ok }); if (r.landed === ok.length) break; } catch (e) { } }
      if (!r) throw new Error('sent, but not confirmed yet. press "verify" on the board in a minute'); log(k, `${r.status}: ${r.landed} of ${r.of} batches. it's on the board.`); SND.chime(); await loadDrops(); await loadStatus(); };
    $$('[data-op]').forEach(b => b.onclick = async () => { const k = b.dataset.op.replace('rm', ''); b.disabled = true; SND.tick(.04, 1800);
      try { const ts = Date.now();
        if (b.dataset.op === 'snap') { log('snap', 'sign the message…'); const msg = `a1r: snapshot ${op} at ${ts}`; const r = await post('snapnow', { msg, sig: await signMsg(msg) }); log('snap', `done: ${r.eligible} on the manifest, ${r.holders} holders read.`); await loadStatus(); }
        if (b.dataset.op === 'claim') { log('claim', 'checking the creator vault…'); const r = await post('claim', { from: op }); if (!r.txs) { log('claim', 'nothing to claim right now.'); } else { const sigs = await signSend(r.txs, t => log('claim', t)); log('claim', sigs[0] ? `claimed ~${fmt(r.sol, 4)} SOL · ${short(sigs[0], 6)}` : 'not sent'); } }
        if (b.dataset.op === 'dropsol') { const amt = +$('#solAmt').value; if (!(amt > 0)) throw new Error('how much SOL?'); await fly('dropsol', { from: op, kind: 'sol', amount: amt }); }
        if (b.dataset.op === 'droptok') { const mint = $('#tokSel').value, amt = +$('#tokAmt').value; if (!mint) throw new Error('pick a coin'); if (!(amt > 0)) throw new Error('how much?'); await fly('droptok', { from: op, kind: 'token', mint, amount: amt }); }
        if (b.dataset.op === 'launch') { const mint = $('#lnMint').value.trim(); const msg = `a1r: launch ${mint} at ${ts}`; log('launch', 'sign the message…'); await post('launch', { msg, sig: await signMsg(msg), name: $('#lnName').value }); log('launch', 'registered. it is on the fleet page.'); await loadStatus(); }
        if (b.dataset.op === 'pump') { const W = await web3(), kp = W.Keypair.generate(), mint = kp.publicKey.toBase58(), f = $('#lpImg').files[0], dry = $('#lpSim').checked; if (!f) throw new Error('add an image');
          const image = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('could not read the image')); r.readAsDataURL(f); });
          const msg = `a1r: launch ${mint} at ${ts}`; log('pump', 'sign the message…'); const sig = await signMsg(msg); log('pump', 'building the launch…');
          const r = await post('buildLaunch', { msg, sig, name: $('#lpName').value, symbol: $('#lpSym').value, devBuy: +$('#lpDev').value, image, twitter: $('#lpX').value, website: $('#lpWeb').value, description: $('#lpDesc').value, simulate: dry });
          if (dry) { log('pump', `dry run ${r.sim && r.sim.err ? 'stopped: ' + JSON.stringify(r.sim.err) : 'passed'}. nothing was sent.\n${((r.sim && r.sim.logs) || []).join('\n')}`); }
          else { const sigs = await signSend(r.txs, t => log('pump', t), txs => txs[0].partialSign(kp)); if (!sigs[0]) throw new Error('the launch was not sent'); log('pump', 'launched. confirming…'); let done = null;
            for (let i = 0; i < 12 && !done; i++) { await new Promise(z => setTimeout(z, 2500)); try { done = await post('launched', { mint, sig: sigs[0] }); } catch (e) { } }
            log('pump', `${done ? 'launched and registered' : 'sent, registering failed: press register with the mint'}: ${mint}\npump.fun/coin/${mint}\nthe dev buy (~${fmt(+r.tokens / 1e6)} tokens) is the cargo for its drop.`); SND.chime(); await loadStatus(); S.coins = null; } }
        if (b.dataset.op === 'fleet' || b.dataset.op === 'fleetrm') { const rm = b.dataset.op === 'fleetrm', mint = $('#flMint').value.trim(), msg = `a1r: fleet ${rm ? 'remove' : 'add'} ${mint} at ${ts}`; log('fleet', 'sign the message…'); await post('fleet', { msg, sig: await signMsg(msg), name: $('#flName').value, remove: rm }); log('fleet', rm ? 'removed.' : 'added. its holders join at the next snapshot.'); S.coins = null; await loadStatus(); }
      } catch (e) { log(k, 'stopped: ' + e.message); SND.blip(180, .04); } b.disabled = false; }); };

  // ---------------------------------------------------------------- the console
  const term = (() => { const el = $('#term'); el.innerHTML = `<div class="th"><span>a1r · console</span><span>tab completes · esc closes</span></div><div class="tb" id="tb"></div><form class="ti" id="tf"><span>&gt;</span><input id="ti" autocomplete="off" spellcheck="false" placeholder="type help"></form>`;
    const tb = $('#tb', el), ti = $('#ti', el), hist = []; let hi = 0;
    const say = (t, c = '') => { tb.insertAdjacentHTML('beforeend', `<div class="${c}">${t}</div>`); tb.scrollTop = 1e9; };
    const CMD = { help: () => say(Object.keys(CMD).map(k => k.padEnd(10) + HELP[k]).join('\n')),
      zone: () => go('#/'), board: () => go('#/board'), radar: () => go('#/radar'), fleet: () => go('#/fleet'), how: () => go('#/how'), ops: () => go('#/ops'),
      pass: a => go('#/pass' + (a ? '/' + a : '')), wallet: a => a ? go('#/pass/' + a) : say('usage: wallet <address>', 'e'),
      drops: async () => { const L = await loadDrops(); say(L.length ? L.slice(0, 20).map(d => `${flight(d)}  ${cargoOf(d).padEnd(6)} ${fmt(amtOf(d), 4).padStart(12)}  ${String(d.wallets).padStart(4)} wallets  ${d.status}`).join('\n') : 'no drops yet'); },
      top: async a => { const h = await loadHolders(300); const n = Math.min(50, +a || 10); say(h.list.length ? h.list.slice(0, n).map(x => `#${String(x.rank).padEnd(4)} ${short(x.w, 5)}  ${pct(x.pct).padStart(9)}  ${x.a ? x.a.m.toFixed(2) + 'x' : ''}`).join('\n') : 'no snapshot yet'); },
      days: () => say(`${DAYS_SINCE()} days since pump.fun said "airdrop coming soon" (9 July 2025).`, 'o'),
      status: async () => { await loadStatus(); const s = S.status; say(`live ${s.live}\nmint ${s.mint || '—'}\noperator ${s.operator || '—'}\nsnapshot ${s.snapAt ? ago(s.snapAt) : 'not yet'}\nmanifest ${s.eligible}\ndrops ${s.drops} · SOL ${s.solDropped} · wallets hit ${s.walletsHit}`); },
      verify: async a => { if (!a) return say('usage: verify <flight id>', 'e'); go('#/d/' + a); },
      sound: a => { SND.set(a !== 'off'); paintSnd(); say('sound ' + (SND.on ? 'on' : 'off')); },
      intro: () => { try { sessionStorage.removeItem('a1r-intro'); } catch (e) { } location.hash = '#/'; location.reload(); },
      clear: () => { tb.innerHTML = ''; } };
    const HELP = { help: 'this list', zone: 'the drop zone', board: 'every drop', radar: 'who is holding', fleet: 'our coins', how: 'the rules', ops: 'the operator console', pass: 'your boarding pass', wallet: '<address> any wallet\'s pass', drops: 'the last 20 drops', top: '[n] the heaviest wallets', days: 'the days since "coming soon"', status: 'the engine', verify: '<id> open a flight', sound: 'on|off', intro: 'watch the intro again', clear: 'clear' };
    $('#tf', el).onsubmit = async e => { e.preventDefault(); const v = ti.value.trim(); if (!v) return; hist.push(v); hi = hist.length; ti.value = ''; say('&gt; ' + esc(v), 'c'); const [c, ...a] = v.split(/\s+/); const f = CMD[c.toLowerCase()]; SND.tick(.03, 2400);
      if (!f) return say(`unknown command: ${esc(c)}. type help`, 'e'); try { await f(a.join(' ')); } catch (x) { say(esc(x.message), 'e'); } };
    ti.onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); const v = ti.value.toLowerCase(), m = Object.keys(CMD).filter(k => k.startsWith(v)); if (m.length === 1) ti.value = m[0] + ' '; else if (m.length) say(m.join('  ')); }
      if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); ti.value = hist[hi] || ''; e.preventDefault(); } if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); ti.value = hist[hi] || ''; } if (e.key === 'Escape') toggle(false); };
    const toggle = v => { const on = v ?? !el.classList.contains('on'); el.classList.toggle('on', on); if (on) { setTimeout(() => ti.focus(), 50); if (!tb.innerHTML) say('A1R console. type help.', 'o'); SND.whoosh(.3, .04, true); } };
    return { toggle, say }; })();

  // ---------------------------------------------------------------- router
  const go = h => { if (location.hash === h) route(); else location.hash = h; };
  async function route() { const h = location.hash.replace(/^#\/?/, ''), [k0, arg] = h.split('/'), k = k0 || 'zone';
    if (k === 'd') { if (!$('#main .view')) await render('board'); dropDrawer(arg); return; }
    await render(V[k] ? k : 'zone', arg); }
  async function render(k, arg) { if (heroStop) { heroStop(); heroStop = null; } if (radarStop) { radarStop(); radarStop = null; } closeDrawer();
    $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.k === k)); movePill(); const m = $('#main'); m.innerHTML = '<div class="view"></div>'; scrollTo({ top: 0 });
    try { await V[k]($('.view', m), arg && decodeURIComponent(arg)); } catch (e) { $('.view', m).innerHTML = `<div class="empty">${esc(e.message)}</div>`; } }
  addEventListener('hashchange', route); addEventListener('resize', movePill);
  addEventListener('keydown', e => { if (e.target.closest('input,textarea,select')) return; if (window.AI && window.AI.active) return; if (e.key === '`') { e.preventDefault(); term.toggle(); return; }
    if (e.key === 's') { SND.set(!SND.on); paintSnd(); return; } if (e.key === 'Escape') { closeDrawer(); term.toggle(false); return; } const n = +e.key; if (n >= 1 && n <= NAV.length) go(NAV[n - 1][1]); });
  document.addEventListener('a1r-audio', () => { if (SND.on && !(window.AI && window.AI.active)) SND.droneOn(.035); });

  // ---------------------------------------------------------------- go
  shell(); const sky = A.sky($('#sky')); window.A1R = { S, go, api, term };
  loadStatus().then(() => { route(); setTimeout(nudge, 4000); }); loadCoins();
  let landedSeen = null;
  setInterval(async () => { if (document.hidden) return; const before = landedSeen; await loadStatus(); const n = (S.status || {}).drops || 0; if (landedSeen === null) { landedSeen = n; return; } landedSeen = n;
    if (before !== null && n > before) { const L = await loadDrops(); const d = L.find(x => x.status === 'landed'); toast(`${d ? flight(d) + ' just landed · ' + d.wallets + ' wallets' : 'a drop just landed'} · <a class="lk" href="#/board">board</a>`); SND.chime(); sky && sky.burst(8); } }, 30000);
  // double-click the sky to drop a crate yourself
  addEventListener('dblclick', e => { if (e.target.closest('a,button,input,select,textarea,.card,.board,.pass,.stage,#term,#drawer,.tbl')) return; sky && sky.drop(e.clientX); SND.pop(.12); });
})();
