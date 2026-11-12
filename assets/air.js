// A1R fx: the crate (pre-rendered 3D ASCII frames), the sky behind everything, split-flap text, and sound written in code
(() => {
  'use strict';
  const A = window.AIR = {};
  const RM = A.RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GLY = A.GLY = '!<>-_\\/[]{}=+*^?#%@$0123456789abcdefABCDEF░▒▓';
  const LUM = '.,-~:;=!*#$@';
  const rnd = s => s[Math.floor(Math.random() * s.length)];
  A.clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)); A.ease = k => 1 - Math.pow(1 - k, 3); A.eio = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  A.span = (t, a, b) => A.clamp((t - a) / (b - a));

  // ---------------------------------------------------------------- the crate: frames rendered offline, one per angle
  let CR = null; A.crateReady = fetch('/assets/crate.json?v=1').then(r => r.json()).then(j => (CR = j)).catch(() => null);
  // draw the crate into a 2D context: centre x,y, cell width cw (px), yaw (radians), alpha, part: 'all' | 'crate' | 'chute'
  A.drawCrate = (g, x, y, cw, yaw, o = {}) => { if (!CR) return null; const a = o.a ?? 1, part = o.part || 'all', ch = cw * 1.917, fs = cw / .6, n = CR.n;
    const k = ((Math.round(yaw / (Math.PI * 2) * n) % n) + n) % n, f = CR.frames[k], C = CR.cols, Rw = CR.rows, x0 = x - C * cw / 2, y0 = y - Rw * ch / 2, off = o.off || null;
    g.textBaseline = 'top'; g.font = `400 ${fs}px JB, monospace`; const buckets = [[], [], [], []];
    for (let i = 0; i < f.length; i++) { const c = f.charCodeAt(i); if (c === 32) continue; const crate = c >= 97, idx = c - (crate ? 97 : 65); if (part === 'crate' && !crate || part === 'chute' && crate) continue;
      buckets[Math.min(3, idx >> 2) + 0].push(i, idx, crate ? 1 : 0); }
    for (let b = 0; b < 4; b++) { const L = buckets[b]; if (!L.length) continue; g.fillStyle = `rgba(240,240,240,${((.46 + b * .18) * a).toFixed(3)})`;
      for (let j = 0; j < L.length; j += 3) { const i = L[j], idx = L[j + 1], cx = i % C, cy = (i / C) | 0; let px = x0 + cx * cw, py = y0 + cy * ch, al = 1;
        if (off) { const d = off(cx, cy, L[j + 2]); if (!d) continue; px += d[0]; py += d[1]; al = d[2]; if (al <= 0) continue; if (al < 1) g.globalAlpha = al; }
        g.fillText(LUM[idx], px, py); if (al < 1) g.globalAlpha = 1; } }
    return { x0, y0, cw, ch, C, R: Rw }; };
  A.crateDims = () => CR ? { cols: CR.cols, rows: CR.rows, n: CR.n } : { cols: 120, rows: 66, n: 48 };

  // a little crate sprite for the sky and the board
  A.SPRITE = [' .-""-. ', '/______\\', '\\  ||  /', ' \\ || / ', '  [##]  '];

  // ---------------------------------------------------------------- the sky: slow stars, and now and then a crate drifting down
  A.sky = cv => { const g = cv.getContext('2d'); let W, H, D, stars = [], drops = [], on = true, last = 0;
    const size = () => { D = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * D; cv.height = H * D; g.setTransform(D, 0, 0, D, 0, 0);
      stars = Array.from({ length: Math.round(W * H / 9000) }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() < .12 ? '+' : '.', a: .08 + Math.random() * .25, v: .02 + Math.random() * .06, p: Math.random() * 6 })); };
    const loop = now => { requestAnimationFrame(loop); if (!on || document.hidden || now - last < 50) return; const dt = Math.min(.1, (now - last) / 1000); last = now;
      g.clearRect(0, 0, W, H); g.textBaseline = 'top'; g.font = '400 11px JB, monospace';
      for (const s of stars) { s.x -= s.v; if (s.x < -5) s.x = W + 5; g.fillStyle = `rgba(255,255,255,${(s.a * (.7 + .3 * Math.sin(now / 900 + s.p))).toFixed(3)})`; g.fillText(s.s, s.x, s.y); }
      if (!RM && drops.filter(d => !d.me).length < 4 && Math.random() < dt * .25) drops.push({ x: W * (.08 + Math.random() * .84), y: -60, v: 14 + Math.random() * 16, ph: Math.random() * 6, s: .7 + Math.random() * .5 });
      g.font = '400 9px JB, monospace'; drops = drops.filter(d => { d.y += d.v * dt; const sw = Math.sin(now / 1100 + d.ph) * 10; const a = Math.min(1, (H - d.y) / 200) * (d.me ? .6 : W < 700 ? .09 : .14);
        A.SPRITE.forEach((l, i) => { g.fillStyle = `rgba(255,255,255,${a})`; g.fillText(l, d.x + sw * (1 - i / 5), d.y + i * 10); }); return d.y < H + 40; }); };
    addEventListener('resize', size); size(); requestAnimationFrame(loop);
    const drop = x => drops.push({ x: x ?? W * (.1 + Math.random() * .8), y: -60, v: 34 + Math.random() * 22, ph: Math.random() * 6, s: 1, me: 1 });
    return { set: v => { on = v; }, drop, burst: n => { for (let i = 0; i < n; i++) setTimeout(() => drop(), i * 180); } }; };

  // ---------------------------------------------------------------- split-flap text: every character flips through glyphs before it lands
  A.flap = (el, text, o = {}) => { if (!el) return; text = String(text); const old = el.dataset.v; if (old === text && !o.force) return; el.dataset.v = text;
    if (RM || o.instant) { el.innerHTML = [...text].map(c => `<i>${c === ' ' ? '&nbsp;' : esc(c)}</i>`).join(''); return; }
    const n = text.length, start = performance.now(), dur = o.dur || 520, stag = o.stag ?? 38; el.classList.add('flipping'); let lastTick = 0;
    const cells = [...text].map(() => document.createElement('i')); el.replaceChildren(...cells);
    const step = now => { let done = true; for (let i = 0; i < n; i++) { const k = (now - start - i * stag) / dur, c = text[i]; if (k >= 1 || c === ' ') { if (cells[i].dataset.f !== '1') { cells[i].innerHTML = c === ' ' ? '&nbsp;' : esc(c); cells[i].dataset.f = '1'; cells[i].classList.remove('fl'); } continue; }
        done = false; if (k < 0) { cells[i].textContent = ' '; continue; } cells[i].textContent = rnd(FLAPSET); cells[i].classList.toggle('fl', Math.floor(k * 9) % 2 === 0); }
      if (now - lastTick > 70 && !done && o.sound !== false) { lastTick = now; SND.tick(.012, 2600 + Math.random() * 1800); }
      if (!done) requestAnimationFrame(step); else el.classList.remove('flipping'); };
    requestAnimationFrame(step); };
  const FLAPSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  A.esc = esc;
  // text that decrypts into place
  A.decrypt = (el, text, dur = 700) => { if (!el) return; if (RM) { el.textContent = text; return; } const t0 = performance.now(), n = text.length;
    const step = now => { const k = Math.min(1, (now - t0) / dur), m = Math.floor(k * n); el.textContent = text.slice(0, m) + [...text.slice(m)].map(c => c === ' ' ? ' ' : rnd(GLY)).join(''); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  // numbers that count up
  A.count = (el, to, fmt = v => Math.round(v).toLocaleString('en-US'), dur = 900) => { if (!el) return; if (RM || !isFinite(to)) { el.textContent = fmt(to); return; } const from = +el.dataset.n || 0, t0 = performance.now(); el.dataset.n = to;
    const step = now => { const k = Math.min(1, (now - t0) / dur); el.textContent = fmt(from + (to - from) * A.ease(k)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };

  // ---------------------------------------------------------------- sound, written in code (no files). quiet by design
  const SND = A.snd = { on: true, ctx: null, master: null, drone: null };
  try { SND.on = localStorage.getItem('a1r-sound') !== '0'; } catch (e) { }
  const ac = () => { if (SND.ctx) return SND.ctx; const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; const c = SND.ctx = new C(), m = SND.master = c.createGain(); m.gain.value = SND.on ? .55 : 0; const comp = c.createDynamicsCompressor(); m.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 1.8, ir = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); } const rv = SND.rv = c.createConvolver(); rv.buffer = ir; const rg = c.createGain(); rg.gain.value = .3; rv.connect(rg); rg.connect(m); return c; };
  const out = () => SND.master, live = () => { const c = SND.ctx; return c && SND.on && c.state === 'running' ? c : null; };
  SND.wake = () => { const c = ac(); if (c && c.state === 'suspended') c.resume(); return c; };
  SND.set = v => { SND.on = v; try { localStorage.setItem('a1r-sound', v ? '1' : '0'); } catch (e) { } const c = SND.wake(); if (c) SND.master.gain.setTargetAtTime(v ? .55 : 0, c.currentTime, .08); document.dispatchEvent(new Event('a1r-sound')); };
  const noiseBuf = c => { if (SND.nb) return SND.nb; const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return SND.nb = b; };
  const env = (g, t, a, peak, r) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + r); };
  SND.tick = (v = .05, f = 5200) => { const c = live(); if (!c) return; const t = c.currentTime, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); s.buffer = noiseBuf(c); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 3; env(g, t, .002, v, .03); s.connect(bp); bp.connect(g); g.connect(out()); s.start(t, Math.random()); s.stop(t + .06); };
  SND.blip = (f = 880, v = .05, d = .09) => { const c = live(); if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + d); env(g, t, .004, v, d); o.connect(g); g.connect(out()); g.connect(SND.rv); o.start(t); o.stop(t + d + .05); };
  SND.whoosh = (d = .9, v = .12, up = true) => { const c = live(); if (!c) return; const t = c.currentTime, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); s.buffer = noiseBuf(c); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(up ? 300 : 3000, t); bp.frequency.exponentialRampToValueAtTime(up ? 4200 : 250, t + d); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + d * .7); g.gain.exponentialRampToValueAtTime(.0001, t + d); s.connect(bp); bp.connect(g); g.connect(out()); g.connect(SND.rv); s.start(t); s.stop(t + d + .1); };
  SND.thump = (v = .5) => { const c = live(); if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + .5); env(g, t, .004, v, .7); o.connect(g); g.connect(out()); g.connect(SND.rv); o.start(t); o.stop(t + .8); };
  SND.pop = (v = .25) => { const c = live(); if (!c) return; const t = c.currentTime, s = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain(); s.buffer = noiseBuf(c); hp.type = 'highpass'; hp.frequency.value = 600; env(g, t, .003, v, .25); s.connect(hp); hp.connect(g); g.connect(out()); g.connect(SND.rv); s.start(t, Math.random()); s.stop(t + .35); SND.blip(180, v * .4, .18); };
  SND.plane = (d = 2.6, v = .08) => { const c = live(); if (!c) return; const t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), pan = c.createStereoPanner ? c.createStereoPanner() : null; o.type = 'sawtooth'; o2.type = 'sawtooth';
    o.frequency.setValueAtTime(96, t); o.frequency.linearRampToValueAtTime(82, t + d); o2.frequency.setValueAtTime(97.5, t); o2.frequency.linearRampToValueAtTime(83, t + d); lp.type = 'lowpass'; lp.frequency.value = 420;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + d * .45); g.gain.linearRampToValueAtTime(0, t + d); o.connect(lp); o2.connect(lp); lp.connect(g); if (pan) { pan.pan.setValueAtTime(-.8, t); pan.pan.linearRampToValueAtTime(.8, t + d); g.connect(pan); pan.connect(out()); } else g.connect(out()); o.start(t); o2.start(t); o.stop(t + d); o2.stop(t + d); };
  SND.chime = () => { [0, .09, .18].forEach((d, i) => setTimeout(() => SND.blip([660, 990, 1320][i], .045, .25), d * 1000)); };
  SND.droneOn = (level = .06) => { const c = SND.wake(); if (!c || SND.drone) return; const t = c.currentTime, g = c.createGain(), lp = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = .7; lfo.frequency.value = .05; lg.gain.value = 140; lfo.connect(lg); lg.connect(lp.frequency);
    const os = [55, 55.3, 82.4, 110.1].map((f, i) => { const o = c.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; const og = c.createGain(); og.gain.value = i < 2 ? .5 : .25; o.connect(og); og.connect(lp); o.start(); return o; });
    lp.connect(g); g.connect(out()); g.connect(SND.rv); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 3); lfo.start(); SND.drone = { g, os, lfo }; };
  SND.droneLevel = (v, s = 1.5) => { const c = SND.ctx; if (c && SND.drone) SND.drone.g.gain.setTargetAtTime(v, c.currentTime, s / 3); };
  const first = () => { SND.wake(); document.dispatchEvent(new Event('a1r-audio')); removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); };
  addEventListener('pointerdown', first, true); addEventListener('keydown', first, true);
})();
