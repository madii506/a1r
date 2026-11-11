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
  const concrete = M(0x1a1b1e, .62, .12); const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 30), concrete); floor.rotation.x = -Math.PI / 2; floor.position.set(29, FLOOR + .001, -26); scene.add(floor);
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
  // ---------------------------------------------------------------- the gallery: the pump.fun coins that went the highest, hung on two white walls in the warehouse
  // each print is the coin's own image (the one its pump.fun page shows), served by the A1R API; only the ticker sits on the placard below
  const GAL = [['PNUT', 21.2, 1], ['GOAT', 24.4, 1], ['FARTCOIN', 27.6, 1], ['MOODENG', 27.4, -1], ['ACT', 30.4, -1], ['BILLY', 33.3, -1]];
  const gwallM = M(0x8e8a83, .96, 0), frameK = M(0x0c0c0c, .45, .2), matM = M(0xb9b5ad, .95, 0), railM = M(0x161616, .5, .5), headM = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
  box(9.6, 3.7, .22, gwallM, 24.5, FLOOR + 1.85, -22.0); box(8.6, 3.7, .22, gwallM, 30.1, FLOOR + 1.85, -30.0);          // the two gallery walls, crates stacked behind them
  box(9.6, .05, .06, railM, 24.5, FLOOR + 3.95, -22.9); box(8.6, .05, .06, railM, 30.1, FLOOR + 3.95, -29.1);              // track rails
  const coneTex = tex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,236,200,.55)'); gr.addColorStop(1, 'rgba(255,236,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const coneM = new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .07, side: THREE.DoubleSide, toneMapped: false });
  const prints = [];
  GAL.forEach(([tk, x, side]) => { const zW = side > 0 ? -22.0 - .12 : -30.0 + .12, ry = side > 0 ? Math.PI : 0, grp = new THREE.Group(); grp.position.set(x, FLOOR + 2.05, zW); grp.rotation.y = ry; scene.add(grp);
    // frame, mat and print are unit pieces scaled to the image's own shape once it loads, so nothing is cropped
    const MAT = .16, FR = .05, fr = box(1, 1, .06, frameK, 0, 0, .03, grp), mt = box(1, 1, .02, matM, 0, 0, .065, grp), t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const img = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M(0x1b1b1b, .8, 0, { emissive: new THREE.Color(0xffffff), emissiveIntensity: 0 })); img.position.z = .08; grp.add(img);
    const fit = (w, h) => { img.scale.set(w, h, 1); mt.scale.set(w + MAT * 2, h + MAT * 2, 1); fr.scale.set(w + MAT * 2 + FR * 2, h + MAT * 2 + FR * 2, 1); if (grp.userData.plq) grp.userData.plq.position.y = -(h / 2 + MAT + FR) - .24; }; fit(1.22, 1.22);
    prints.push([tk, (im) => { const a = im.naturalWidth / im.naturalHeight, w = Math.min(2.1, 1.22 * a), h = w / a; t.image = im; t.needsUpdate = true; img.material.color.setHex(0xffffff); img.material.map = t; img.material.emissiveMap = t; img.material.emissiveIntensity = .1; img.material.needsUpdate = true; fit(w, h); }]);
    // the placard: just the ticker
    const pc = document.createElement('canvas'); pc.width = 512; pc.height = 128; const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace; pt.anisotropy = 8; const drawP = () => { const q = pc.getContext('2d'); q.fillStyle = '#f4f1ea'; q.fillRect(0, 0, 512, 128); q.fillStyle = '#111'; q.font = '700 64px "ID", "Inter", system-ui, sans-serif'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('$' + tk, 256, 68); pt.needsUpdate = true; }; drawP(); prints.push(['placard', drawP]);
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(.66, .165), M(0xffffff, .8, 0, { map: pt, emissiveMap: pt, emissive: new THREE.Color(0xffffff), emissiveIntensity: .05 })); plq.position.set(0, -(1.22 / 2 + MAT + FR) - .24, .02); grp.add(plq); grp.userData.plq = plq;
    // a track spot over each print, with its beam
    const hx = .0, hy = 1.9, hz = .85; box(.09, .16, .09, railM, hx, hy, hz, grp); const lens = box(.07, .02, .07, headM, hx, hy - .09, hz, grp);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(.75, 1.7, 24, 1, true), coneM); beam.position.set(hx, hy - .95, hz - .38); beam.rotation.x = .42; grp.add(beam);
    if (!mobile) { const L = new THREE.SpotLight(0xffeccd, 6, 6, .5, .7, 1.4); L.position.set(x, FLOOR + 3.95, zW + (side > 0 ? -.85 : .85)); L.target.position.set(x, FLOOR + 2.0, zW); scene.add(L, L.target); } });
  // the images, whole and uncropped; until one loads its frame holds a dark print
  prints.filter(p => p[0] !== 'placard').forEach(([tk, show]) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => show(im); im.src = '/api/a1r?a=art&t=' + tk; });
  try { document.fonts.load('700 64px ID').then(() => prints.forEach(p => p[0] === 'placard' && p[1]())).catch(() => { }); } catch (e) { }
  // dust in the air, and moonlight falling from the high windows
  const DN = mobile ? 260 : 700, dpos = new Float32Array(DN * 3), dsp = new Float32Array(DN); for (let i = 0; i < DN; i++) { dpos[i * 3] = 18.6 + rnd() * 21; dpos[i * 3 + 1] = FLOOR + rnd() * 8; dpos[i * 3 + 2] = -40.5 + rnd() * 29; dsp[i] = .03 + rnd() * .09; }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dot = tex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(1, 'rgba(255,240,215,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ size: .045, map: dot, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe8c8 })); scene.add(dust);
  const dustTick = dt => { const a = dGeo.attributes.position.array; for (let i = 0; i < DN; i++) { a[i * 3 + 1] += dsp[i] * dt; a[i * 3] += Math.sin((a[i * 3 + 1] + i) * .7) * .004; if (a[i * 3 + 1] > FLOOR + 8) a[i * 3 + 1] = FLOOR; } dGeo.attributes.position.needsUpdate = true; };

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
  const vig = document.createElement('div'); vig.className = 'i3v'; host.appendChild(vig);
  const fade = document.createElement('div'); fade.className = 'i3f'; host.appendChild(fade);
  // ---------------------------------------------------------------- run
  let t0 = 0, raf = 0, over = false, lastStep = -1, lastScr = 0, lastLine = -1, lastNow = 0, lookS = null, fired = {};
  const once = (k, fn) => { if (!fired[k]) { fired[k] = 1; fn(); } };
  function frame(now) { if (over) return; raf = requestAnimationFrame(frame); if (!t0) t0 = now; const t = window.__i3dT ?? (now - t0) / 1000;
    const c = camAt(t), dt = Math.min(.1, (now - (lastNow || now)) / 1000); lastNow = now; dustTick(dt || .016); if (!lookS || window.__i3dT != null) lookS = c.look.clone(); else lookS.lerp(c.look, 1 - Math.exp(-dt * 7)); cam.position.copy(c.pos); cam.lookAt(lookS); if (Math.abs(cam.fov - c.fov) > .01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
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
