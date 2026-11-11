// A1R intro, without a word: a counter runs up to the days since "airdrop coming soon" and falls apart into stars,
// a plane crosses the night, a crate drops, its parachute opens, it drifts down to you, lands, bursts open, and you dive in.
(() => {
  'use strict';
  const el = document.getElementById('intro'), A = window.AIR, SND = A.snd, { clamp, ease, eio, span } = A;
  const atHome = location.hash.replace(/^#\/?/, '') === '';
  let seen = false; try { seen = sessionStorage.getItem('a1r-intro') === '1'; } catch (e) { }
  window.AI = { active: false, replay: null };
  if (!el) return;
  if (!atHome || A.RM || seen) { el.remove(); return; }
  window.AI.active = true; document.documentElement.classList.add('pre-app');
  const cv = el.querySelector('canvas'), g = cv.getContext('2d');
  const DAYS = Math.max(0, Math.floor((Date.now() - Date.UTC(2025, 6, 9)) / 86400e3));
  const T = { count: [.35, 1.75], burst: 1.95, plane: [2.15, 4.6], drop: 3.0, chute: 3.5, land: 6.05, open: 6.6, dive: [6.75, 7.55], end: 7.6 };
  let W, H, D, t0 = 0, raf = 0, done = false, lastNum = -1, fired = {};
  const size = () => { D = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * D; cv.height = H * D; };
  const once = (k, fn) => { if (!fired[k]) { fired[k] = 1; fn(); } };
  // ---------------------------------------------------------------- seven-segment digits drawn as blocks; their blocks become stars
  const SEG = { 0: 'abcedf', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const segRects = (str, cx, y, s) => { const R = []; let w = str.length * s * 4 - s; let x = cx - w / 2;
    for (const ch of str) { const on = SEG[ch] || '', w3 = s * 3, h = s * 5, P = (X, Y, ww, hh) => R.push([x + X, y + Y, ww, hh]);
      if (on.includes('a')) P(0, 0, w3, s * .7); if (on.includes('g')) P(0, h / 2 - s * .35, w3, s * .7); if (on.includes('d')) P(0, h - s * .7, w3, s * .7);
      if (on.includes('f')) P(0, 0, s * .7, h / 2); if (on.includes('b')) P(w3 - s * .7, 0, s * .7, h / 2); if (on.includes('e')) P(0, h / 2, s * .7, h / 2); if (on.includes('c')) P(w3 - s * .7, h / 2, s * .7, h / 2); x += s * 4; }
    return R; };
  let STARS = null, BURST = null;
  const PLANE = ['            __', '  ___ _____/  |____', ' <___|____________|>==-', '      \\_\\     /_/'];
  // ---------------------------------------------------------------- one frame
  function frame(now) { if (done) return; raf = requestAnimationFrame(frame); if (!t0) t0 = now; const t = (now - t0) / 1000;
    g.setTransform(D, 0, 0, D, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.textBaseline = 'top';
    const s = clamp(W / 46, 7, 20), cy = H * .42;
    // 1. the days since "airdrop coming soon"
    if (t < T.burst) { const k = span(t, T.count[0], T.count[1]), n = Math.floor(ease(k) * DAYS), str = String(n).padStart(String(DAYS).length, '0'), a = span(t, .1, .4);
      if (n !== lastNum && t > T.count[0]) { if (now % 2 < 1 || k > .9) SND.tick(.03, 1800 + (n % 7) * 120); lastNum = n; }
      const v = Math.round(245 * a * (k >= 1 ? .9 + .1 * Math.sin(t * 30) : 1)); g.fillStyle = `rgb(${v},${v},${v})`; for (const r of segRects(str, W / 2, cy - s * 2.5, s)) g.fillRect(...r);
      if (k >= 1) once('held', () => SND.blip(220, .06, .3)); }
    // the digits fall apart into the stars
    if (t >= T.burst) { once('burst', () => { SND.whoosh(1.2, .08, false); const R = segRects(String(DAYS), W / 2, cy - s * 2.5, s); BURST = []; for (const r of R) for (let i = 0; i < 6; i++) BURST.push({ x: r[0] + Math.random() * r[2], y: r[1] + Math.random() * r[3], vx: (Math.random() - .5) * 260, vy: (Math.random() - .5) * 200 - 40 }); });
      const k = span(t, T.burst, T.burst + 1.1); g.font = '400 12px JB, monospace'; for (const p of BURST) { const x = p.x + p.vx * ease(k), y = p.y + p.vy * ease(k); g.fillStyle = `rgba(255,255,255,${(1 - k * .75).toFixed(3)})`; g.fillText(k < .3 ? '█' : '.', x, y); } }
    // the night sky
    if (!STARS) STARS = Array.from({ length: Math.round(W * H / 5200) }, () => ({ x: Math.random() * W, y: Math.random() * H * .86, c: Math.random() < .1 ? '+' : '.', a: .15 + Math.random() * .5, p: Math.random() * 6 }));
    const sa = span(t, T.burst - .1, T.burst + .9); if (sa > 0) { g.font = '400 11px JB, monospace'; for (const st of STARS) { g.fillStyle = `rgba(255,255,255,${(st.a * sa * (.7 + .3 * Math.sin(t * 2 + st.p))).toFixed(3)})`; g.fillText(st.c, st.x - t * 6, st.y); } }
    // 2. a plane crosses, and drops a crate
    const pk = span(t, T.plane[0], T.plane[1]), px = mix(-260, W + 60, pk), py = H * .14;
    if (pk > 0 && pk < 1) { once('plane', () => SND.plane(T.plane[1] - T.plane[0], .07)); g.font = '400 16px JB, monospace'; PLANE.forEach((l, i) => { g.fillStyle = 'rgba(235,235,235,.9)'; g.fillText(l, px, py + i * 18); });
      if (Math.floor(t * 3) % 2) { g.fillStyle = '#fff'; g.fillText('*', px + 222, py + 8); } }
    const xd = mix(-260, W + 60, span(T.drop, T.plane[0], T.plane[1])) + 80, yd = py + 50;
    // 3. the crate: it falls, the chute opens, it drifts down to you
    if (t >= T.drop && t < T.dive[1]) { once('drop', () => SND.whoosh(.5, .05, false));
      const fk = span(t, T.chute, T.land), e = eio(fk), cwEnd = clamp(H * .5 / 126, 2.8, 6.4), cw = t < T.chute ? .8 : mix(.8, cwEnd, Math.pow(fk, 1.6)), chH = 66 * cw * 1.917, gy = H * .86;
      let x = t < T.chute ? xd + (t - T.drop) * 30 : mix(xd + 15, W / 2, e), y = t < T.chute ? yd + Math.pow(t - T.drop, 2) * 260 : mix(yd + 65, gy - chH * .5 + chH * .02, Math.pow(fk, 1.25));
      if (t >= T.land) { x = W / 2; y = gy - chH * .5 + chH * .02; }
      if (t >= T.chute) once('chute', () => SND.pop(.28));
      const sway = t < T.land ? Math.sin(t * 2.3) * .07 * (1 - fk * .8) : 0, yaw = .6 + t * .55, lk = span(t, T.land, T.land + .9), ok = span(t, T.open, T.open + .8);
      // the ground comes up to meet it
      const ga = span(t, T.land - 1.2, T.land - .2); if (ga > 0) { g.font = '400 12px JB, monospace'; for (let gx = 0; gx < W; gx += 9) { const d = Math.abs(gx - W / 2) / W; g.fillStyle = `rgba(255,255,255,${(ga * (.55 - d * .7)).toFixed(3)})`; g.fillText(gx % 18 ? '_' : '.', gx, gy - 4); }
        for (let r = 1; r < 6; r++) for (let gx = 0; gx < W; gx += 22 + r * 6) { g.fillStyle = `rgba(255,255,255,${(ga * .12 / r).toFixed(3)})`; g.fillText('.', gx + (r * 37) % 22, gy + r * r * 7); } }
      g.save(); g.translate(x, y - chH * .45); g.rotate(sway); g.translate(-x, -(y - chH * .45));
      if (t < T.chute) A.drawCrate(g, x, y, cw, yaw, { part: 'crate' });
      else if (t < T.land) { A.drawCrate(g, x, y, cw, yaw, { part: 'crate' }); A.drawCrate(g, x, y, cw * mix(.4, 1, ease(span(t, T.chute, T.chute + .25))), yaw, { part: 'chute', a: ease(span(t, T.chute, T.chute + .2)) }); }
      else { // landed: the chute slumps away, then the crate bursts open
        A.drawCrate(g, x, y, cw, yaw, { part: 'chute', off: (cx, cy2) => { const h = ((cx * 73 + cy2 * 151) % 97) / 97; return [lk * lk * (140 + h * 160) * (cx > 60 ? 1 : -1) * .6, lk * lk * (120 + h * 260), 1 - lk * 1.1]; } });
        A.drawCrate(g, x, y, cw, yaw, { part: 'crate', off: ok > 0 ? (cx, cy2) => { const h = ((cx * 53 + cy2 * 97) % 89) / 89, dx = (cx - 60) * cw, dy = (cy2 - 50) * cw * 1.917; return [dx * ok * (2 + h * 4), dy * ok * (2 + h * 3) - ok * 120 * h, 1 - ok * 1.2]; } : null }); }
      g.restore();
      if (t >= T.land) { once('land', () => { SND.thump(.55); SND.tick(.08, 900); }); const dk = span(t, T.land, T.land + .9); g.font = '400 14px JB, monospace';
        for (let i = 0; i < 70; i++) { const h1 = (i * 0.6180339) % 1, h2 = (i * 0.4142135) % 1, side = i % 2 ? 1 : -1, dx = side * (60 + h1 * 420) * ease(dk), dy = -(h2 * 90) * Math.sin(dk * Math.PI) - 4;
          g.fillStyle = `rgba(255,255,255,${((1 - dk) * (.3 + h2 * .5)).toFixed(3)})`; g.fillText('.,~\'`'[i % 5], W / 2 + side * cw * 34 + dx, gy - 10 + dy); } }
      if (t >= T.open) { once('open', () => { SND.whoosh(.9, .12, true); SND.chime(); }); const k = span(t, T.open, T.open + 1.0); g.font = '700 18px JB, monospace';
        for (let i = 0; i < 90; i++) { const an = -Math.PI / 2 + ((i * 0.618) % 1 - .5) * 2.6, v = 260 + ((i * 0.414) % 1) * 520, X = W / 2 + Math.cos(an) * v * ease(k), Y = y + Math.sin(an) * v * ease(k) + k * k * 260;
          g.fillStyle = `rgba(255,255,255,${(1 - k).toFixed(3)})`; g.fillText('$$◎+*'[i % 5], X, Y); }
        g.fillStyle = `rgba(255,255,255,${((1 - span(t, T.open, T.open + .35)) * .5).toFixed(3)})`; g.fillRect(0, 0, W, H); } }
    // 4. the dive: into the light where the crate was
    if (t >= T.dive[0]) { const k = span(t, T.dive[0], T.dive[1]); g.fillStyle = `rgba(0,0,0,${eio(k).toFixed(3)})`; g.fillRect(0, 0, W, H); if (k >= 1) finish(); }
    g.setTransform(D, 0, 0, D, 0, 0); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, H - 1, W, 1); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(0, H - 1, W * clamp(t / T.end), 1); }
  const mix = (a, b, k) => a + (b - a) * k;
  function finish(skipped) { if (done) return; done = true; cancelAnimationFrame(raf); if (window.AI.s3) window.AI.s3.stop(); try { sessionStorage.setItem('a1r-intro', '1'); } catch (e) { }
    SND.droneLevel(.03, 3); document.documentElement.classList.remove('pre-app'); window.AI.active = false; if (window.AI.onDone) window.AI.onDone(); el.classList.add('out'); setTimeout(() => el.remove(), 900); removeEventListener('keydown', key); }
  const key = e => { if (['Enter', 'Escape', ' '].includes(e.key)) { e.preventDefault(); SND.whoosh(.5, .08, true); finish(true); } };
  const paintSnd = () => { const b = el.querySelector('.snd'); if (b) b.textContent = SND.on ? 'sound on' : 'sound off'; };
  el.querySelector('.skip').onclick = e => { e.stopPropagation(); SND.wake(); finish(true); };
  el.querySelector('.snd').onclick = e => { e.stopPropagation(); SND.set(!SND.on); if (SND.on) SND.droneOn(.06); paintSnd(); };
  el.addEventListener('pointerdown', () => { SND.wake(); if (SND.on) SND.droneOn(.06); });
  addEventListener('keydown', key); addEventListener('resize', () => { if (!done) { size(); STARS = null; } });
  document.addEventListener('a1r-audio', () => { if (SND.on && !done) SND.droneOn(.06); });
  paintSnd(); size();
  // the 3D walk (street, stairs, warehouse, the PC) when the browser has WebGL; the ASCII crate drop when it doesn't
  let S3 = null; const start2d = () => { cv.style.display = ''; A.crateReady.then(() => { if (!done) raf = requestAnimationFrame(frame); }); };
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (gl && !window.__no3d) { cv.style.display = 'none'; import('/assets/intro3d.js?v=1').then(m => { if (done) return; S3 = m.run({ host: el, SND, done: () => finish() }); window.AI.s3 = S3; }).catch(() => start2d()); } else start2d();
  window.AI.time = v => { t0 = performance.now() - v * 1000; };   // for still frames while testing
})();
