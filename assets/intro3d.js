// A1R intro in 3D, first person: you walk down a street at night, turn right into a building, climb the stairs into a warehouse
// full of crates, sit down at the one PC that's on, watch A1R boot on its screen, and get pulled in.
import * as THREE from './vendor/three.module.min.js';
import { EffectComposer } from './vendor/EffectComposer.js';
import { RenderPass } from './vendor/RenderPass.js';
import { UnrealBloomPass } from './vendor/UnrealBloomPass.js';
import { OutputPass } from './vendor/OutputPass.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), mix = (a, b, k) => a + (b - a) * k, span = (t, a, b) => clamp((t - a) / (b - a));
const eio = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, eout = k => 1 - Math.pow(1 - k, 3), smooth = k => k * k * (3 - 2 * k);
const T = { walk: [0.25, 10.4], sit: [10.25, 11.15], power: 10.8, boot: [11.0, 13.75], push: [13.45, 14.95], end: 15.05 };
const DX = 35.6, FLOOR = 3.6;   // the desk's x, the warehouse floor

export function run({ host, SND, done }) {
  const mobile = innerWidth < 700, W0 = innerWidth, H0 = innerHeight; let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.6)); renderer.setSize(W0, H0); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.65;
  renderer.domElement.className = 'i3d'; host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x04050a); scene.fog = new THREE.FogExp2(0x04050a, .028);
  const cam = new THREE.PerspectiveCamera(mobile ? 66 : 54, W0 / H0, .05, 140);
  const M = (c, r = .8, m = .05, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...x });
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

  const DAYS = Math.max(0, Math.floor((Date.now() - Date.UTC(2025, 6, 9)) / 86400e3));
  // ---------------------------------------------------------------- the street
  const asphalt = M(0x0b0c0f, .9); const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 140), asphalt); ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -20); scene.add(ground);
  for (const s of [-1, 1]) box(2.6, .14, 140, M(0x15161a, .85), s * 5.7, .07, -20);
  const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(.14, 2.2), new THREE.MeshBasicMaterial({ color: 0x3a3a34 }), 16), dm = new THREE.Object3D();
  for (let i = 0; i < 16; i++) { dm.position.set(0, .012, 8 - i * 6); dm.rotation.set(-Math.PI / 2, 0, 0); dm.updateMatrix(); dash.setMatrixAt(i, dm.matrix); } scene.add(dash);
  // facades: one window texture per mood, lit at random
  const winTex = (hue) => tex(256, 512, (g, w, h) => { g.fillStyle = '#0a0b0e'; g.fillRect(0, 0, w, h); for (let y = 10; y < h - 10; y += 26) for (let x = 12; x < w - 12; x += 28) { const on = rnd() < .28; g.fillStyle = on ? (rnd() < .7 ? `hsl(${hue},${60 + rnd() * 30}%,${55 + rnd() * 20}%)` : '#bfd2ff') : '#121318'; g.fillRect(x, y, 14, 16); } });
  const WT = [winTex(36), winTex(28), winTex(44)];
  const building = (x, z, w, d, h, k) => { const t = WT[k % 3].clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, d / 6), Math.max(1, h / 10)); t.needsUpdate = true;
    const mat = M(0x1a1b20, .85, .1, { map: t, emissiveMap: t, emissive: new THREE.Color(0xffffff), emissiveIntensity: .9 }); box(w, h, d, mat, x, h / 2, z); };
  let z = 10, k = 0; while (z > -60) { const d = 6 + rnd() * 6; building(-11, z - d / 2, 8, d - .3, 9 + rnd() * 20, k++); z -= d; }
  z = 10; while (z > -60) { const d = 6 + rnd() * 6; if (z - d >= -21 || z <= -36) building(11, z - d / 2, 8, d - .3, 9 + rnd() * 20, k++); z -= d; }
  // the building we walk into: a dark facade with a lit doorway and a small crate sign over it
  const facade = M(0x16171b, .9); box(.4, 14, 3.9, facade, 7.2, 7, -22.95); box(.4, 14, 9, facade, 7.2, 7, -31.6); box(.4, 11.3, 2.2, facade, 7.2, 8.35, -26);
  const signT = tex(128, 128, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.arc(64, 54, 40, Math.PI, 0); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(26, 56); g.lineTo(52, 84); g.moveTo(102, 56); g.lineTo(76, 84); g.stroke(); g.fillStyle = '#fff'; g.fillRect(46, 82, 36, 30); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({ map: signT, toneMapped: false })); sign.position.set(6.98, 3.3, -26); sign.rotation.y = -Math.PI / 2; scene.add(sign);
  // street lamps
  const pole = M(0x22242a, .5, .6), bulbM = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  for (const [x, zz, lit] of [[6.3, 2, 1], [-6.3, -6, 1], [6.3, -14, 1], [-6.3, -18, 0], [6.3, -38, 0], [-6.3, -30, 0]]) { const s = Math.sign(x);
    box(.14, 5.2, .14, pole, x, 2.6, zz); box(1.3, .1, .1, pole, x - s * .6, 5.15, zz); const b = box(.5, .12, .3, bulbM, x - s * 1.15, 5.06, zz);
    if (lit) { const L = new THREE.PointLight(0xffc98a, 30, 16, 1.7); L.position.set(x - s * 1.15, 4.8, zz); scene.add(L); } }
  const moon = new THREE.DirectionalLight(0x8ea6d8, .5); moon.position.set(-10, 20, 10); scene.add(moon); scene.add(new THREE.AmbientLight(0x9aa8c8, .16));
  const doorL = new THREE.PointLight(0xffe2b8, 14, 9, 1.6); doorL.position.set(8.4, 2.6, -26); scene.add(doorL);
  // a few crates on the sidewalk by the door
  const crateT = tex(256, 256, (g, w) => { g.fillStyle = '#4a3a28'; g.fillRect(0, 0, w, w); for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(0,0,0,${.08 + rnd() * .12})`; g.fillRect(0, i * 28, w, 2); } g.strokeStyle = '#8a7350'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, w - 18); g.lineWidth = 14; g.beginPath(); g.moveTo(18, 18); g.lineTo(w - 18, w - 18); g.moveTo(w - 18, 18); g.lineTo(18, w - 18); g.stroke(); });
  const crateM = M(0xffffff, .85, 0, { map: crateT }); for (const [x, y, zz, r] of [[5.8, .74, -22.6, .2], [5.6, .74, -21.4, -.1], [5.75, 1.95, -22.0, .4]]) box(1.2, 1.2, 1.2, crateM, x, y, zz).rotation.y = r;

  // ---------------------------------------------------------------- the stairwell
  const wallM = M(0x1e1f24, .95); box(11, 8, .2, wallM, 12.6, 4, -27.15); box(11, 8, .2, wallM, 12.6, 4, -24.85); box(11, .2, 2.5, wallM, 12.6, 7.9, -26);
  box(2, .1, 2.2, M(0x2a2b30, .9), 8, .05, -26);
  const stepM = M(0x2b2c31, .8); for (let i = 0; i < 12; i++) box(.56, .3 * (i + 1), 2.1, stepM, 9.2 + i * .55, .15 * (i + 1), -26);
  box(2.6, FLOOR, 2.1, stepM, 16.7, FLOOR / 2, -26);
  const stairL = new THREE.PointLight(0xcfe0ff, 10, 9, 1.6); stairL.position.set(12.5, 7, -26); scene.add(stairL); box(.6, .06, .2, new THREE.MeshBasicMaterial({ color: 0xe6f0ff, toneMapped: false }), 12.5, 7.75, -26);

  // ---------------------------------------------------------------- the warehouse
  const concrete = M(0x17181b, .92); const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 30), concrete); floor.rotation.x = -Math.PI / 2; floor.position.set(29, FLOOR + .001, -26); scene.add(floor);
  const wh = M(0x141519, .95); box(.3, 9, 30, wh, 39.9, FLOOR + 4.5, -26); box(22, 9, .3, wh, 29, FLOOR + 4.5, -40.9); box(22, 9, .3, wh, 29, FLOOR + 4.5, -11.1);
  box(.3, 9, 13.9, wh, 18.1, FLOOR + 4.5, -34.05); box(.3, 9, 13.9, wh, 18.1, FLOOR + 4.5, -17.95); box(.3, 6.4, 2.2, wh, 18.1, FLOOR + 5.8, -26); box(22, .3, 30, wh, 29, FLOOR + 9, -26);
  for (let x = 20; x < 40; x += 4) box(.25, .45, 30, M(0x101114, .8, .3), x, FLOOR + 8.6, -26);
  // high windows: moonlight in strips
  const winM = new THREE.MeshBasicMaterial({ color: 0x22304a, toneMapped: false }); for (let zz = -38; zz < -13; zz += 4) box(.05, 1.2, 2.6, winM, 39.7, FLOOR + 7.2, zz);
  // crates in stacks, an aisle down the middle
  const cg = new THREE.BoxGeometry(1.2, 1.2, 1.2), slots = []; for (let x = 20.5; x < 33.5; x += 1.45) for (const zz of [-19.2, -20.6, -32.2, -33.6]) { const h = 1 + Math.floor(rnd() * 3.2); for (let i = 0; i < h; i++) slots.push([x + (rnd() - .5) * .08, FLOOR + .66 + i * 1.22, zz + (rnd() - .5) * .08, (rnd() - .5) * .12]); }
  const crates = new THREE.InstancedMesh(cg, crateM, slots.length); slots.forEach((s, i) => { dm.position.set(s[0], s[1], s[2]); dm.rotation.set(0, s[3], 0); dm.updateMatrix(); crates.setMatrixAt(i, dm.matrix); }); scene.add(crates);
  const palletM = M(0x3a2e20, .9); for (let x = 20.5; x < 33.5; x += 1.45) for (const zz of [-19.9, -32.9]) box(1.3, .08, 2.7, palletM, x, FLOOR + .04, zz);
  // hanging lamps over the aisle
  const shadeM = M(0x1b1c20, .5, .6), hot = new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false });
  for (const x of [22.5, 28.5, 34]) { box(.03, 3.4, .03, shadeM, x, FLOOR + 7.3, -26); const sh = new THREE.Mesh(new THREE.ConeGeometry(.55, .45, 20, 1, true), shadeM); sh.position.set(x, FLOOR + 5.4, -26); scene.add(sh); box(.3, .05, .3, hot, x, FLOOR + 5.2, -26);
    const S = new THREE.SpotLight(0xffe0b0, 80, 15, .85, .7, 1.4); S.position.set(x, FLOOR + 5.15, -26); S.target.position.set(x, FLOOR, -26); scene.add(S, S.target);
    const F = new THREE.PointLight(0xffd8a8, 9, 11, 1.5); F.position.set(x, FLOOR + 4.6, -26); scene.add(F); }
  // ---------------------------------------------------------------- the gallery: pump.fun coins that went to the moon, painted as moons
  // original paintings: the ticker, the fact, the date. No logos or mascots, those belong to their makers.
  const GAL = [['PNUT', 'peaked above $2B', 'nov 2024', 28], ['GOAT', 'first pump.fun coin past $1B', '2024', 205], ['FARTCOIN', 'passed $1B', 'dec 2024', 95], ['CHILLGUY', 'hit $600M', 'nov 2024', 190],
    ['MOODENG', 'above $300M', '2024', 330], ['ACT', '+1,720% on its binance listing', 'nov 2024', 265], ['BILLY', 'pump.fun\'s no. 2 at $100M+', '2024', 45]];
  const paintings = [];
  function painting(c, [tk, line, date, hue], big) { const g = c.getContext('2d'), w = c.width, h = c.height; let sd = 7 + tk.length * 977 + hue * 31; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${hue},42%,${big ? 9 : 13}%)`); gr.addColorStop(.6, `hsl(${(hue + 25) % 360},38%,8%)`); gr.addColorStop(1, `hsl(${(hue + 40) % 360},30%,5%)`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.lineCap = 'round'; for (let k = 0; k < (big ? 2200 : 1100); k++) { const x = r() * w, y = r() * h * .72, l = 6 + r() * w / 12, a = (r() - .5) * .9; g.strokeStyle = `hsla(${hue + (r() - .5) * 50},${35 + r() * 35}%,${18 + r() * 34}%,${.05 + r() * .12})`; g.lineWidth = 1.5 + r() * w / 90; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * .5, y + (r() - .5) * 10, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(255,250,235,${.2 + r() * .6})`; const sz = r() < .1 ? 2.4 : 1.3; g.fillRect(r() * w, r() * h * .6, sz, sz); }
    // the moon, in ASCII, lit from the upper left, with craters
    const cx = w * .5, cy = h * (big ? .38 : .36), R = Math.min(w, h) * (big ? .24 : .28), cs = Math.max(8, Math.round(w / 56)), ramp = ' .,:;-=+*#%@'; const cr = Array.from({ length: 6 }, () => [(r() - .5) * 1.2, (r() - .5) * 1.2, .12 + r() * .18]);
    const glow = g.createRadialGradient(cx, cy, R * .8, cx, cy, R * 1.9); glow.addColorStop(0, `hsla(${hue + 30},60%,70%,.22)`); glow.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.font = `700 ${Math.round(cs * 1.15)}px "JB", ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let y = cy - R; y <= cy + R; y += cs * 1.2) for (let x = cx - R; x <= cx + R; x += cs * .82) { const dx = (x - cx) / R, dy = (y - cy) / R, d2 = dx * dx + dy * dy; if (d2 > 1) continue;
      let L = Math.max(0, -dx * .5 - dy * .55 + Math.sqrt(1 - d2) * .75); for (const [ux, uy, ur] of cr) { const q = Math.hypot(dx - ux, dy - uy) / ur; if (q < 1) L *= .55 + .45 * q; }
      g.fillStyle = `hsla(${hue + 35},${25 + L * 25}%,${48 + L * 46}%,${.3 + L * .7})`; g.fillText(ramp[Math.min(ramp.length - 1, Math.floor(L * ramp.length))], x, y); }
    // the facts
    const T1 = big ? tk : '$' + tk, fs = big ? 150 : Math.min(104, Math.floor(w * .9 / (T1.length * .64))); g.font = `700 ${fs}px "ID", "Inter", system-ui, sans-serif`; g.fillStyle = '#f3efe5'; g.fillText(T1, cx, h * (big ? .74 : .755));
    g.font = `${big ? 34 : 21}px "JB", ui-monospace, monospace`; g.fillStyle = 'rgba(243,239,229,.82)'; g.fillText(line, cx, h * (big ? .855 : .865));
    g.fillStyle = 'rgba(243,239,229,.45)'; g.font = `${big ? 24 : 16}px "JB", ui-monospace, monospace`; g.fillText(big ? date : date + ' · born on pump.fun', cx, h * (big ? .92 : .925));
    const vg = g.createRadialGradient(cx, h / 2, Math.min(w, h) * .45, cx, h / 2, Math.max(w, h) * .78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, w, h); }
  const frameM = M(0x2a2118, .55, .35), legM = M(0x1c1712, .7, .2), lightM = new THREE.MeshBasicMaterial({ color: 0xffe6c0, toneMapped: false });
  function hang(data, x, y, z, ry, fw, fh, big, easel) { const c = document.createElement('canvas'); c.width = big ? 1024 : 512; c.height = Math.round(c.width * fh / fw); painting(c, data, big);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; paintings.push([c, data, big, t]);
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry; scene.add(grp);
    box(fw + .14, fh + .14, .07, frameM, 0, 0, -.02, grp); const cv = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), M(0xffffff, .9, 0, { map: t, emissiveMap: t, emissive: new THREE.Color(0xffffff), emissiveIntensity: .62 })); cv.position.z = .02; grp.add(cv);
    box(fw * .5, .035, .05, lightM, 0, fh / 2 + .13, .07, grp);
    if (easel) { for (const sx of [-.42, .42]) { const lg = box(.06, y - FLOOR + fh / 2 - .1, .06, legM, sx * fw, -(y - FLOOR) / 2 + fh / 4 - .05, -.05, grp); lg.rotation.z = sx * -.04; } box(.05, y - FLOOR + .2, .05, legM, 0, -(y - FLOOR) / 2 + .1, -.45, grp).rotation.x = -.22; box(fw * .95, .05, .1, legM, 0, -fh / 2 - .06, .02, grp); } }
  GAL.forEach((d, i) => { const right = i % 2 === 0, k = Math.floor(i / 2); hang(d, 21.6 + k * 3.1 + (right ? 0 : 1.55), FLOOR + 1.9, right ? -22.15 : -29.85, right ? Math.PI + .3 : -.3, 1.25, 1.56, false, true); });
  const redraw = () => paintings.forEach(([c, d, big, t]) => { painting(c, d, big); t.needsUpdate = true; });
  try { Promise.all([document.fonts.load('700 96px ID'), document.fonts.load('20px JB')]).then(redraw).catch(() => { }); } catch (e) { }

  // the desk, the PC, the chair
  const deskM = M(0x151618, .5, .25); box(1.3, .05, 2, deskM, DX, FLOOR + .74, -26); for (const zz of [-26.9, -25.1]) box(1.2, .72, .05, M(0x0f1012, .6), DX, FLOOR + .36, zz);
  box(.17, .02, .24, M(0x1a1a1a, .4, .4), DX + .42, FLOOR + .775, -26); box(.03, .3, .03, M(0x1d1d1d, .35, .6), DX + .4, FLOOR + .92, -26); const bezel = box(.03, .58, 1.0, M(0x0e0e0e, .4, .3), DX + .32, FLOOR + 1.08, -26);
  const SW = 1024, SH = 600, scr = document.createElement('canvas'); scr.width = SW; scr.height = SH; const sg = scr.getContext('2d'); const scrT = new THREE.CanvasTexture(scr); scrT.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.95, .55), new THREE.MeshBasicMaterial({ map: scrT, toneMapped: false })); screen.position.set(DX + .3, FLOOR + 1.08, -26); screen.rotation.y = -Math.PI / 2; scene.add(screen);
  const SCR = new THREE.Vector3(DX + .3, FLOOR + 1.08, -26);
  box(.16, .015, .44, M(0x121212, .5, .2), DX - .15, FLOOR + .775, -26); const keyLed = box(.14, .004, .4, new THREE.MeshBasicMaterial({ color: 0x0c0c0c, toneMapped: false }), DX - .15, FLOOR + .786, -26);
  const chairM = M(0x1d1e22, .6, .15); const chair = new THREE.Group(); chair.position.set(DX - 1.05, FLOOR, -26); scene.add(chair); box(.48, .07, .48, chairM, 0, .48, 0, chair); box(.06, .55, .44, chairM, -.24, .82, 0, chair); box(.05, .44, .05, M(0x222, .3, .7), 0, .24, 0, chair);
  const glow = new THREE.PointLight(0xcfe8ff, 0, 5, 2); glow.position.set(DX - .2, FLOOR + 1.1, -26); scene.add(glow);
  const deskLamp = new THREE.PointLight(0xffd9a8, 3, 4, 2); deskLamp.position.set(DX + .1, FLOOR + 1.4, -27.1); scene.add(deskLamp); box(.12, .08, .12, hot, DX + .1, FLOOR + 1.32, -27.1);

  // ---------------------------------------------------------------- the screen: it wakes up and boots A1R, the same log the site opens on
  const MONO = '"JB", ui-monospace, Menlo, monospace'; try { document.fonts && document.fonts.load('20px JB'); } catch (e) { }
  const sh = (w, n = 4) => w ? w.slice(0, n) + '…' + w.slice(-n) : '';
  let SL = null; const screenLines = () => { const s = (window.A1R && window.A1R.S && window.A1R.S.status) || {}, R = s.rules || { maxMult: 3, multDays: 14, minHoldPct: .01, maxRecipients: 400 };
    const L = [['h', 'A1R v1 · dropzone · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' utc'],
      ['ok', 'load ', 'snapshot reader', 'token program · pools out'], ['ok', 'load ', 'holder clocks', `1x → ${R.maxMult}x over ${R.multDays} days`],
      ['ok', 'load ', 'weights', 'share × clock'], ['ok', 'load ', 'seat rule', `hold ≥ ${R.minHoldPct}% of a supply`],
      ['ok', 'load ', 'drop builder', `18 SOL · 6 coin per tx · ≤ ${R.maxRecipients}`], ['ok', 'load ', 'proof', 'memo + tag ' + (s.tag ? sh(s.tag) : 'on every batch')],
      ['ok', 'load ', 'recovery', 'resume from chain, never twice'], ['ok', 'load ', 'cockpit', 'pump.fun launch, one signature'],
      ['ok', 'mount', 'drop ledger', s.storage === false ? 'offline' : 'online'],
      [s.mint ? 'ok' : '..', 'token', '$A1R', s.mint ? sh(s.mint, 5) : 'not live yet'], [s.operator ? 'ok' : '..', 'wallet', 'operator', s.operator ? sh(s.operator, 5) : 'not set yet'],
      ['ok', 'drops', 'landed', `${s.drops || 0} · ${s.walletsHit || 0} wallets`], ['!!', 'watch', 'pump.fun airdrop', `${DAYS} days "coming soon"`],
      ['p', './a1r --status']]; return L; };
  function drawScreen(t) { const k = span(t, T.power, T.power + .25), b = span(t, T.boot[0], T.boot[1]); sg.fillStyle = '#030403'; sg.fillRect(0, 0, SW, SH);
    if (t < T.power) { scrT.needsUpdate = true; return; }
    if (k < 1) { const h = Math.max(2, SH * eout(k) * .9 * (1 - k)), w = SW * Math.min(1, k * 3); sg.fillStyle = '#e8ffe8'; sg.fillRect((SW - w) / 2, (SH - h) / 2, w, h + 2); scrT.needsUpdate = true; return; }
    if (!SL) SL = screenLines(); sg.textBaseline = 'middle';
    // title bar and tmux bar, like the site
    sg.fillStyle = '#0c0c0c'; sg.fillRect(0, 0, SW, 40); sg.fillStyle = '#2a2a2a'; for (let i = 0; i < 3; i++) { sg.beginPath(); sg.arc(26 + i * 20, 20, 6, 0, 7); sg.fill(); }
    sg.font = `600 17px ${MONO}`; sg.fillStyle = '#ececec'; sg.fillText('A1R', 96, 21); sg.font = `15px ${MONO}`; sg.fillStyle = '#8b8b8b'; sg.textAlign = 'center'; sg.fillText('a1r@dropzone: ~', SW / 2, 21); sg.textAlign = 'left';
    sg.fillStyle = '#0c0c0c'; sg.fillRect(0, SH - 34, SW, 34); sg.fillStyle = '#8af0b4'; sg.fillRect(12, SH - 28, 54, 22); sg.font = `14px ${MONO}`; sg.fillStyle = '#000'; sg.fillText('[a1r]', 17, SH - 16);
    ['1:zone*', '2:promise', '3:board', '4:pass', '5:radar', '6:fleet', '7:how', '8:ops'].forEach((x, i) => { const X = 78 + i * 92; if (!i) { sg.fillStyle = '#b8b8b8'; sg.fillRect(X - 6, SH - 28, 82, 22); } sg.fillStyle = i ? '#8b8b8b' : '#000'; sg.fillText(x, X, SH - 16); });
    // the log, typed line by line
    const n = b * SL.length, top = 64, lh = 31; sg.font = `18px ${MONO}`;
    for (let i = 0; i < SL.length && i < n; i++) { const L = SL[i], y = top + i * lh, part = Math.min(1, n - i), cut = s => s.slice(0, Math.ceil(s.length * part));
      if (L[0] === 'h') { sg.fillStyle = '#6b6b6b'; sg.fillText(cut(L[1]), 28, y); continue; }
      if (L[0] === 'p') { sg.fillStyle = '#8af0b4'; sg.fillText('a1r@dropzone', 28, y); sg.fillStyle = '#9ab6ff'; sg.fillText(':~', 28 + 12 * 10.85, y); sg.fillStyle = '#ececec'; const c = cut('$ ' + L[1]); sg.fillText(c, 28 + 14 * 10.85, y); if (Math.floor(t * 3) % 2) { sg.fillStyle = '#a8a8a8'; sg.fillRect(28 + (14 + c.length) * 10.85 + 2, y - 10, 11, 21); } continue; }
      const st = L[0], col = st === 'ok' ? '#8af0b4' : st === '!!' ? '#ff7a7a' : '#8b8b8b'; sg.fillStyle = col; sg.fillText(`[ ${st} ]`, 28, y);
      sg.fillStyle = '#9ab6ff'; sg.fillText(L[1], 112, y); const lab = L[2] + ' ' + '.'.repeat(Math.max(2, 22 - L[2].length)); sg.fillStyle = '#6b6b6b'; sg.fillText(cut(lab), 196, y);
      if (part >= 1) { sg.fillStyle = st === '!!' ? '#ff9a9a' : '#ececec'; sg.fillText(L[3], 196 + 24 * 10.85, y); } }
    const fl = span(t, T.push[1] - .5, T.push[1]); if (fl > 0) { sg.fillStyle = `rgba(0,0,0,${fl})`; sg.fillRect(0, 0, SW, SH); }
    sg.fillStyle = 'rgba(255,255,255,.025)'; for (let y = (t * 90) % 4; y < SH; y += 4) sg.fillRect(0, y, SW, 1); scrT.needsUpdate = true; }

  // ---------------------------------------------------------------- the walk: down the street, right into the door, up the stairs, through the warehouse
  const path = new THREE.CatmullRomCurve3([[0, 1.7, -4], [0, 1.7, -12], [0, 1.7, -19.5], [.9, 1.7, -24.2], [3.6, 1.7, -25.85], [6.6, 1.7, -26], [8.7, 1.72, -26], [12.3, 3.55, -26], [15.7, 5.3, -26], [18.2, 5.3, -26], [23, 5.3, -26], [28.5, 5.3, -26], [DX - 1.15, 5.3, -26]].map(p => new THREE.Vector3(...p)), false, 'centripetal', .5);
  const LEN = path.getLength(), dur = T.walk[1] - T.walk[0], ramp = .7;
  // distance travelled: accelerate, cruise, slow down at the desk
  const vmax = LEN / (dur - ramp * .5 - 1.1 * .5), dist0 = t => { const s = clamp(t - T.walk[0], 0, dur); if (s < ramp) return vmax * s * s / (2 * ramp); const a = vmax * ramp / 2; if (s < dur - 1.1) return a + vmax * (s - ramp); const r = s - (dur - 1.1); return Math.min(LEN, a + vmax * (dur - 1.1 - ramp) + vmax * (r - r * r / (2 * 1.1))); };
  // the same walk, re-timed: brisk on the street, slow through the gallery so the paintings can be seen
  const WARP = (() => { const N = 600, acc = [0]; let tt = 0, prev = path.getPointAt(0); for (let k = 1; k <= N; k++) { const q = path.getPointAt(k / N), ds = q.distanceTo(prev); tt += ds / (q.x > 18.6 && q.x < 33.2 ? .55 : 1.15); acc.push(tt); prev = q; } return acc.map(v => v / tt); })();
  const dist = t => { const f = dist0(t) / LEN; let lo = 0, hi = WARP.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (WARP[mid] < f) lo = mid; else hi = mid; } const k = (f - WARP[lo]) / Math.max(1e-9, WARP[hi] - WARP[lo]); return LEN * (lo + k) / (WARP.length - 1); };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function camAt(t) { const u = clamp(dist(t) / LEN), p = path.getPointAt(u), ahead = path.getPointAt(Math.min(1, u + 5 / LEN)), walking = smooth(span(t, T.walk[0], T.walk[0] + .8)) * (1 - smooth(span(t, T.walk[1] - 1.2, T.walk[1] - .2)));
    const ph = dist(t) * 1.1, onStairs = smooth(span(p.x, 8.4, 9.2)) * (1 - smooth(span(p.x, 15.4, 16.2))); tmp.copy(ahead).sub(p).normalize(); const side = tmp2.crossVectors(tmp, up).normalize();
    const pos = p.clone().addScaledVector(up, (Math.abs(Math.sin(ph * Math.PI)) - .5) * .016 * walking * (1 + onStairs * .3)).addScaledVector(side, Math.sin(ph * Math.PI * .5) * .006 * walking);
    const look = ahead.clone(); look.y += onStairs * .3 - .05; const gal = smooth(span(p.x, 19, 21)) * (1 - smooth(span(p.x, 31, 33.2))); look.z += Math.sin((p.x - 19) / 12.5 * Math.PI * 1.5) * 1.5 * gal;
    // near the end of the walk the gaze settles on the screen
    const g = smooth(span(t, T.walk[1] - 1.6, T.walk[1])); look.lerp(SCR, g);
    // sit down, look at the screen, lean in
    const ks = eio(span(t, T.sit[0], T.sit[1])); pos.lerp(tmp.set(DX - .95, FLOOR + 1.22, -26), ks); pos.y -= Math.sin(span(t, T.sit[1] - .1, T.sit[1] + .35) * Math.PI) * .03;
    pos.lerp(SCR, smooth(span(t, T.sit[1], T.push[0])) * .2);
    // the push ends on the prompt line, so the site opens on the same command
    const kp = eio(span(t, T.push[0], T.push[1])); pos.lerp(tmp.set(SCR.x - .12, SCR.y - .18, SCR.z - .3), kp); if (ks > 0) look.lerp(SCR, ks); if (kp > 0) look.lerp(tmp2.set(SCR.x, SCR.y - .18, SCR.z - .3), kp);
    return { pos, look, fov: mix(mobile ? 66 : 54, 26, kp), stepPh: ph, walking }; }
  // ---------------------------------------------------------------- post
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam)); const bloom = new UnrealBloomPass(new THREE.Vector2(W0, H0), .7, .6, .78); composer.addPass(bloom); composer.addPass(new OutputPass());
  const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); composer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }; addEventListener('resize', resize);
  const fade = document.createElement('div'); fade.className = 'i3f'; host.appendChild(fade);
  // ---------------------------------------------------------------- run
  let t0 = 0, raf = 0, over = false, lastStep = -1, lastScr = 0, lastLine = -1, lastNow = 0, lookS = null, fired = {};
  const once = (k, fn) => { if (!fired[k]) { fired[k] = 1; fn(); } };
  function frame(now) { if (over) return; raf = requestAnimationFrame(frame); if (!t0) t0 = now; const t = window.__i3dT ?? (now - t0) / 1000;
    const c = camAt(t), dt = Math.min(.1, (now - (lastNow || now)) / 1000); lastNow = now; if (!lookS || window.__i3dT != null) lookS = c.look.clone(); else lookS.lerp(c.look, 1 - Math.exp(-dt * 7)); cam.position.copy(c.pos); cam.lookAt(lookS); if (Math.abs(cam.fov - c.fov) > .01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    const st = Math.floor(c.stepPh); if (c.walking > .5 && st !== lastStep) { lastStep = st; const p = c.pos; SND.tick(p.x > 8.6 && p.x < 15.8 ? .06 : .05, p.x > 8.6 ? 520 + Math.random() * 120 : 300 + Math.random() * 60); }
    if (t > 3.3) once('turn', () => SND.whoosh(.5, .04, false)); if (t > 4.75) once('door', () => { SND.blip(160, .04, .3); SND.droneLevel(.05, 2); });
    if (t > 7.7) once('wh', () => { SND.whoosh(1.2, .05, true); SND.droneLevel(.08, 2); }); if (t > T.sit[1] - .1) once('sit', () => SND.thump(.3));
    if (t > T.power) once('pw', () => { SND.blip(1200, .04); SND.tick(.1, 1900); }); if (t > T.push[0]) once('push', () => SND.whoosh(1.4, .12, true));
    glow.intensity = t > T.power ? 6 * eout(span(t, T.power, T.power + .5)) : 0; keyLed.material.color.setHex(t > T.boot[0] ? 0x1c2a22 : 0x0c0c0c);
    if (t > T.boot[0] && t < T.boot[1]) { const li = Math.floor(span(t, T.boot[0], T.boot[1]) * 15); if (li !== lastLine) { lastLine = li; SND.tick(.025, 2200 + li * 60); } }
    if (now - lastScr > 33) { lastScr = now; drawScreen(t); }
    bloom.strength = .7 + span(t, T.push[0], T.push[1]) * .4;
    fade.style.opacity = String(t < .7 ? 1 - t / .7 : t > T.push[1] - .2 ? span(t, T.push[1] - .2, T.end) : 0);
    composer.render(); if (t >= T.end && window.__i3dT == null) finish(); }
  function finish() { if (over) return; over = true; cancelAnimationFrame(raf); removeEventListener('resize', resize); setTimeout(() => { renderer.dispose(); renderer.domElement.remove(); }, 900); done(); }
  raf = requestAnimationFrame(frame);
  return { stop: finish };
}
