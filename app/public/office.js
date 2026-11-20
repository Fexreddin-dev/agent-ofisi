/* Agent Ofisi — small dependency-free 3D renderer (Canvas 2D, orthographic, painter's algorithm).
   World units ≈ metres. x → east, y → north, z → up. Floor 28 × 18. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- palettes ----------
  const PAL = {
    dark: {
      bg1: '#0b0d12', bg2: '#141821', floor: '#181b23', line: 'rgba(255,255,255,0.035)',
      rooms: { lab: '#16202c', sayt: '#211a22', arasdirma: '#1c1b29', media: '#1a2120', mudir: '#231f17', lounge: '#1a1c22' },
      desk: '#4a5060', deskSide: '#363b47', chair: '#262a34', frame: '#4b5466', glass: [150, 205, 255, 0.075], glassEdge: 'rgba(170,215,255,0.22)',
      screenOff: '#1b2230', plant: '#2f6b4a', pot: '#5b4f45', sofa: '#3b3550', shelf: '#3a3330', rack: '#20242c', rug: 'rgba(255,255,255,0.03)',
      ambient: 0.5, diffuse: 0.55, shadow: 'rgba(0,0,0,0.38)', glow: 1,
    },
    light: {
      bg1: '#e9e7e1', bg2: '#f6f5f1', floor: '#f3f1ec', line: 'rgba(0,0,0,0.045)',
      rooms: { lab: '#e7eef3', sayt: '#f2e9e9', arasdirma: '#ece9f3', media: '#e8f0ea', mudir: '#f3ecdf', lounge: '#efede8' },
      desk: '#dcc7a5', deskSide: '#c4ab86', chair: '#cfcac0', frame: '#9aa4b0', glass: [120, 170, 210, 0.12], glassEdge: 'rgba(90,130,170,0.35)',
      screenOff: '#3a4250', plant: '#4f8f5f', pot: '#b9a48c', sofa: '#c9bfd9', shelf: '#b89f80', rack: '#5a6170', rug: 'rgba(0,0,0,0.035)',
      ambient: 0.68, diffuse: 0.36, shadow: 'rgba(60,50,40,0.18)', glow: 0.75,
    },
  };
  const STATUS_COL = { working: '#4ade80', waiting: '#fbbf24', blocked: '#f87171', idle: '#64748b' };

  // ---------- layout ----------
  const ROOMS = [
    { id: 'lab', name: 'Lab və Model', x: 0, y: 9, w: 11, d: 9 },
    { id: 'sayt', name: 'Sayt studiyası', x: 11, y: 9, w: 7.5, d: 9 },
    { id: 'arasdirma', name: 'Araşdırma', x: 18.5, y: 9, w: 9.5, d: 9 },
    { id: 'media', name: 'Media studiyası', x: 0, y: 0, w: 12, d: 7.5 },
    { id: 'lounge', name: 'Giriş', x: 12, y: 0, w: 4, d: 7.5 },
    { id: 'mudir', name: 'Müdir', x: 16, y: 0, w: 12, d: 7.5 },
  ];
  // person position + facing (unit vector where the person looks)
  const DESKS = {
    lumen: { x: 2.4, y: 12.0, f: [1, 0] },
    nova: { x: 2.4, y: 15.4, f: [1, 0] },
    vizor: { x: 8.2, y: 13.7, f: [-1, 0] },
    memar: { x: 13.2, y: 13.6, f: [1, 0] },
    munsif: { x: 16.6, y: 13.6, f: [-1, 0] },
    kesfiyyatci: { x: 21.0, y: 12.6, f: [1, 0] },
    qapici: { x: 25.6, y: 15.2, f: [-1, 0] },
    puls: { x: 2.4, y: 2.3, f: [1, 0] },
    qelem: { x: 2.4, y: 5.3, f: [1, 0] },
    palitra: { x: 9.6, y: 2.3, f: [-1, 0] },
    kadr: { x: 9.6, y: 5.3, f: [-1, 0] },
    atlas: { x: 22.0, y: 4.7, f: [0, -1], big: true },
  };
  const POINTS = { lab: { x: 5.6, y: 17.6, z: 1.5 }, 'istifadəçi': { x: 14, y: 0.4, z: 1.2 }, panel: { x: 14, y: 0.4, z: 1.2 }, hakim: { x: 9.8, y: 17.2, z: 1.2 } };
  const SKIN = ['#e9c3a0', '#c99a74', '#8d5e3c', '#f1d2b6', '#b07a52', '#e3b48f'];

  // ---------- camera ----------
  const cam = { yaw: -0.62, pitch: 0.66, scale: 30, panX: 0, panY: 0, cx: 14, cy: 9, tYaw: null };
  let W = 0, H = 0, dpr = 1, ctx, canvas, labelsEl, pal = PAL.dark, themeName = 'dark';
  let cy_ = Math.cos(cam.yaw), sy_ = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);

  function updTrig() { cy_ = Math.cos(cam.yaw); sy_ = Math.sin(cam.yaw); cp = Math.cos(cam.pitch); sp = Math.sin(cam.pitch); }
  function proj(x, y, z) {
    const dx = x - cam.cx, dy = y - cam.cy;
    const xr = dx * cy_ - dy * sy_;
    const yr = dx * sy_ + dy * cy_;
    return [W / 2 + cam.panX + xr * cam.scale, H / 2 + 40 + cam.panY - (yr * sp + z * cp) * cam.scale, -yr * cp + z * sp];
  }
  function depth(x, y, z) { const dx = x - cam.cx, dy = y - cam.cy; return -(dx * sy_ + dy * cy_) * cp + z * sp; }
  // is a world-space normal facing the camera?
  function facing(nx, ny, nz) { const yr = nx * sy_ + ny * cy_; return -yr * cp + nz * sp > 0.0001; }

  // ---------- colour ----------
  const rgbCache = {};
  function rgb(hex) {
    if (rgbCache[hex]) return rgbCache[hex];
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return (rgbCache[hex] = v);
  }
  const L = (() => { const v = [-0.45, -0.65, 1]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
  function shade(hex, nx, ny, nz, mul = 1) {
    const [r, g, b] = rgb(hex);
    const k = (pal.ambient + pal.diffuse * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2])) * mul;
    return `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
  }
  function mix(a, b, t) { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

  // ---------- scene ----------
  let statics = [];   // static boxes (walls, furniture)
  let agents = {};    // id -> {def, state, anim}
  let selected = null, hovered = null, insetL = 0;
  const flows = [];   // handoff animations

  function box(x, y, z, w, d, h, color, o = {}) { return { t: 'box', x, y, z, w, d, h, color, ...o }; }
  function sphere(x, y, z, r, color, o = {}) { return { t: 'sph', x, y, z, r, color, ...o }; }

  function wallRun(x1, y1, x2, y2, h, doors = [], outer = false) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const T = 0.06;
    let s = 0;
    const cuts = [];
    const sorted = doors.slice().sort((a, b) => a[0] - b[0]);
    for (const [a, b] of sorted) { if (a > s) cuts.push([s, a]); s = b; }
    if (s < len) cuts.push([s, len]);
    const out = [];
    for (const [a, b] of cuts) {
      const n = Math.max(1, Math.ceil((b - a) / 1.25));
      const step = (b - a) / n;
      for (let i = 0; i < n; i++) {
        const p = a + i * step, q = p + step;
        const ax = x1 + ux * p, ay = y1 + uy * p, bx = x1 + ux * q, by = y1 + uy * q;
        const bx0 = Math.min(ax, bx) - (ux === 0 ? T / 2 : 0), by0 = Math.min(ay, by) - (uy === 0 ? T / 2 : 0);
        const bw = Math.abs(bx - ax) || T, bd = Math.abs(by - ay) || T;
        out.push(box(bx0, by0, 0, bw, bd, h, '#ffffff', { glass: true }));
        out.push(box(bx0, by0, h, bw, bd, 0.05, 'frame', { frame: true }));
        if (outer || i === 0) out.push(box(bx0, by0, 0, bw, bd, 0.08, 'frame', { frame: true }));
      }
      // posts at segment ends
      for (const p of [a, b]) {
        const px = x1 + ux * p - 0.04, py = y1 + uy * p - 0.04;
        out.push(box(px, py, 0, 0.08, 0.08, h + 0.05, 'frame', { frame: true }));
      }
    }
    return out;
  }

  function deskSet(id, def) {
    const { x, y, f, big } = def;
    const fx = f[0], fy = f[1];
    const items = [];
    const deskW = big ? 2.2 : 1.5, deskD = big ? 0.95 : 0.75;
    const dx = x + fx * 0.72, dy = y + fy * 0.72; // desk centre
    const along = fx !== 0; // desk long side runs along y when facing x
    const w = along ? deskD : deskW, d = along ? deskW : deskD;
    items.push(box(dx - w / 2, dy - d / 2, 0.7, w, d, 0.05, 'desk', { part: 'top' }));
    // legs/panels
    if (along) {
      items.push(box(dx - w / 2 + 0.03, dy - d / 2, 0, w - 0.06, 0.05, 0.7, 'deskSide'));
      items.push(box(dx - w / 2 + 0.03, dy + d / 2 - 0.05, 0, w - 0.06, 0.05, 0.7, 'deskSide'));
    } else {
      items.push(box(dx - w / 2, dy - d / 2 + 0.03, 0, 0.05, d - 0.06, 0.7, 'deskSide'));
      items.push(box(dx + w / 2 - 0.05, dy - d / 2 + 0.03, 0, 0.05, d - 0.06, 0.7, 'deskSide'));
    }
    // monitor(s)
    const mons = big ? [-0.45, 0.45] : [0];
    for (const off of mons) {
      const mx = x + fx * 1.0 + (along ? 0 : off), my = y + fy * 1.0 + (along ? off : 0);
      const sw = along ? 0.05 : 0.62, sd = along ? 0.62 : 0.05;
      items.push(box(mx - 0.04, my - 0.04, 0.75, 0.08, 0.08, 0.16, 'frame'));
      items.push(box(mx - sw / 2, my - sd / 2, 0.9, sw, sd, 0.38, 'screen', { screen: id, fn: [-fx, -fy] }));
    }
    // chair
    items.push(box(x - 0.26, y - 0.26, 0.42, 0.52, 0.52, 0.08, 'chair'));
    items.push(box(x - 0.05, y - 0.05, 0, 0.1, 0.1, 0.42, 'chair'));
    const bx = x - fx * 0.27, by = y - fy * 0.27;
    items.push(box(bx - (along ? 0.04 : 0.26), by - (along ? 0.26 : 0.04), 0.5, along ? 0.08 : 0.52, along ? 0.52 : 0.08, 0.62, 'chair'));
    return items;
  }

  function buildStatics() {
    const s = [];
    const H = 2.2, HO = 1.05;
    // outer (lower) walls
    s.push(...wallRun(0, 0, 0, 18, HO, [], true));
    s.push(...wallRun(0, 18, 28, 18, HO, [], true));
    s.push(...wallRun(28, 0, 28, 18, HO, [], true));
    s.push(...wallRun(0, 0, 12, 0, HO, [], true));
    s.push(...wallRun(16, 0, 28, 0, HO, [], true));
    // corridor wall y=9 with doors
    s.push(...wallRun(0, 9, 28, 9, H, [[4.6, 6.2], [13.8, 15.4], [22.2, 23.8]]));
    s.push(...wallRun(11, 9, 11, 18, H));
    s.push(...wallRun(18.5, 9, 18.5, 18, H));
    // front rooms
    s.push(...wallRun(0, 7.5, 12, 7.5, H, [[5.2, 6.8]]));
    s.push(...wallRun(12, 0, 12, 7.5, H, [[0, 0]]));
    s.push(...wallRun(16, 0, 16, 7.5, H));
    s.push(...wallRun(16, 7.5, 28, 7.5, H, [[2.0, 3.6]]));
    // furniture per desk
    for (const [id, def] of Object.entries(DESKS)) s.push(...deskSet(id, def));
    // Lab: big wall screen + GPU rack
    s.push(box(4.2, 17.55, 0.9, 2.8, 0.08, 1.2, 'frame'));
    s.push(box(4.3, 17.5, 1.0, 2.6, 0.05, 1.0, 'screen', { labScreen: true, fn: [0, -1] }));
    s.push(box(9.6, 16.4, 0, 0.9, 1.1, 1.9, 'rack', { rack: true }));
    // Araşdırma: bookshelf
    s.push(box(27.4, 10.2, 0, 0.5, 3.2, 1.9, 'shelf'));
    for (let i = 0; i < 4; i++) s.push(box(27.38, 10.3 + i * 0.78, 0.35 + (i % 2) * 0.55, 0.06, 0.6, 0.35, i % 2 ? '#7c5cbf' : '#c46b4e'));
    // Müdir: sofa + coffee table + rug
    s.push(box(25.4, 1.0, 0, 2.2, 0.85, 0.42, 'sofa'));
    s.push(box(25.4, 1.0, 0.42, 2.2, 0.22, 0.45, 'sofa'));
    s.push(box(25.8, 2.5, 0, 1.3, 0.7, 0.36, 'deskSide'));
    // Media: whiteboard
    s.push(box(5.0, 7.38, 0.8, 2.2, 0.05, 1.1, '#e8e8e4'));
    // Lounge: coffee bar + plants
    s.push(box(12.4, 5.6, 0, 1.6, 0.6, 1.0, 'deskSide'));
    s.push(box(12.4, 5.6, 1.0, 1.6, 0.6, 0.04, 'desk'));
    for (const [px, py, k] of [[12.6, 1.0, 1.1], [15.4, 1.0, 1.0], [0.6, 8.2, 0.9], [27.3, 8.3, 1.0], [10.4, 9.9, 0.8], [18.0, 17.3, 0.9], [27.3, 6.9, 0.85], [0.6, 17.3, 0.95]]) {
      s.push(box(px - 0.22, py - 0.22, 0, 0.44, 0.44, 0.42, 'pot'));
      s.push(sphere(px, py, 0.42 + 0.38 * k, 0.36 * k, 'plant'));
      s.push(sphere(px + 0.12, py - 0.1, 0.42 + 0.68 * k, 0.24 * k, 'plant'));
    }
    statics = s;
  }

  function colorOf(c) { return pal[c] || c; }

  // ---------- per-frame dynamic objects ----------
  function agentObjects(t) {
    const out = [];
    for (const [id, a] of Object.entries(agents)) {
      const def = DESKS[id];
      if (!def) continue;
      const st = a.state.status || 'idle';
      const { x, y, f } = def;
      const fx = f[0], fy = f[1];
      const work = st === 'working' && !a.state.stale;
      const ph = a.phase;
      const bob = reduced ? 0 : work ? Math.sin(t * 5 + ph) * 0.018 : Math.sin(t * 1.3 + ph) * 0.008;
      const col = a.def.reng || '#888';
      const body = mix(col, themeName === 'dark' ? '#1a1d26' : '#ffffff', 0.25);
      const along = fx !== 0;
      // torso (sits slightly forward)
      const tx = x + fx * 0.02, ty = y + fy * 0.02;
      out.push(box(tx - (along ? 0.14 : 0.22), ty - (along ? 0.22 : 0.14), 0.5 + bob, along ? 0.28 : 0.44, along ? 0.44 : 0.28, 0.56, body, { agent: id }));
      // arms
      const type = work && !reduced ? Math.sin(t * 14 + ph) * 0.02 : 0;
      for (const side of [-1, 1]) {
        const ox = along ? 0 : side * 0.26, oy = along ? side * 0.26 : 0;
        const ax = x + ox + fx * 0.2, ay = y + oy + fy * 0.2;
        out.push(box(ax - 0.06 - (along ? 0.14 : 0), ay - 0.06 - (along ? 0 : 0.14), 0.74 + (side > 0 ? type : -type), along ? 0.4 : 0.12, along ? 0.12 : 0.4, 0.09, body, { agent: id }));
      }
      // head
      const hx = x + fx * 0.04, hy = y + fy * 0.04;
      const look = st === 'waiting' && !reduced ? Math.sin(t * 2 + ph) * 0.04 : 0;
      out.push(sphere(hx + (along ? 0 : look), hy + (along ? look : 0), 1.26 + bob, 0.16, SKIN[a.skin], { agent: id, head: true }));
      // hair cap
      out.push(sphere(hx - fx * 0.03, hy - fy * 0.03, 1.33 + bob, 0.13, themeName === 'dark' ? '#2a2420' : '#3a2e26', { agent: id, hair: true }));
      // status lamp on desk
      const lx = x + fx * 0.72 + (along ? 0 : -0.55), ly = y + fy * 0.72 + (along ? -0.5 : 0);
      out.push(sphere(lx, ly, 0.82, 0.055, STATUS_COL[a.state.stale ? 'idle' : st], { lamp: id }));
    }
    return out;
  }

  function screenColor(id, t) {
    const a = agents[id];
    if (!a) return pal.screenOff;
    const st = a.state.status;
    if (a.state.stale) return mix(pal.screenOff, '#64748b', 0.35);
    if (st === 'working') { const fl = reduced ? 0.85 : 0.75 + 0.25 * Math.abs(Math.sin(t * 3 + a.phase)); return mix(pal.screenOff, a.def.reng, fl); }
    if (st === 'waiting') return mix(pal.screenOff, '#fbbf24', reduced ? 0.8 : 0.5 + 0.4 * (Math.sin(t * 4) > 0 ? 1 : 0.2));
    if (st === 'blocked') return mix(pal.screenOff, '#f87171', 0.8);
    return mix(pal.screenOff, '#7c8aa0', 0.18);
  }

  // ---------- drawing ----------
  function poly(pts, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function drawBox(b, t) {
    const { x, y, z, w, d, h } = b;
    const P = [
      proj(x, y, z), proj(x + w, y, z), proj(x + w, y + d, z), proj(x, y + d, z),
      proj(x, y, z + h), proj(x + w, y, z + h), proj(x + w, y + d, z + h), proj(x, y + d, z + h),
    ];
    const faces = [
      [[4, 5, 6, 7], 0, 0, 1],
      [[0, 1, 5, 4], 0, -1, 0],
      [[2, 3, 7, 6], 0, 1, 0],
      [[3, 0, 4, 7], -1, 0, 0],
      [[1, 2, 6, 5], 1, 0, 0],
    ];
    if (b.glass) {
      const [r, g, bb, al] = pal.glass;
      for (const [idx, nx, ny, nz] of faces) {
        if (!facing(nx, ny, nz)) continue;
        if (nz) continue;
        poly(idx.map((i) => P[i]), `rgba(${r},${g},${bb},${al})`, null);
      }
      // top edge highlight
      ctx.strokeStyle = pal.glassEdge; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(P[4][0], P[4][1]); ctx.lineTo(P[5][0], P[5][1]); ctx.lineTo(P[6][0], P[6][1]); ctx.lineTo(P[7][0], P[7][1]); ctx.closePath(); ctx.stroke();
      return;
    }
    let base = colorOf(b.color);
    for (const [idx, nx, ny, nz] of faces) {
      if (!facing(nx, ny, nz)) continue;
      let fill;
      if (b.screen && b.fn && nx === b.fn[0] && ny === b.fn[1]) {
        fill = screenColor(b.screen, t);
      } else if (b.labScreen && ny === -1) {
        const on = Object.values(agents).some((a) => a.def.otaq === 'lab' && a.state.status === 'working');
        fill = mix(pal.screenOff, '#7cc6ff', on ? (reduced ? 0.7 : 0.55 + 0.2 * Math.sin(t * 2)) : 0.3);
      } else if (b.rack && (nx !== 0 || ny !== 0) && facing(nx, ny, 0)) {
        fill = shade(base, nx, ny, nz);
        poly(idx.map((i) => P[i]), fill);
        // LED strip by GPU load
        const g = window.__gpu || {};
        const hot = g.ok ? Math.min(1, (g.util || 0) / 100) : 0;
        const ledC = g.ok && g.temp >= 75 ? '#f87171' : g.ok && (g.util > 10 || g.labLock || g.ofisLock) ? '#4ade80' : '#3b82f6';
        for (let k = 0; k < 6; k++) {
          const zz = z + 0.25 + k * 0.26;
          const on = k / 6 < Math.max(0.17, hot) ? 1 : 0.25;
          const fxN = nx, fyN = ny;
          const cxp = nx ? (nx > 0 ? x + w + 0.001 : x - 0.001) : x + w * 0.2;
          const cyp = ny ? (ny > 0 ? y + d + 0.001 : y - 0.001) : y + d * 0.2;
          const ex = nx ? cxp : x + w * 0.8, ey = ny ? cyp : y + d * 0.8;
          const a1 = proj(cxp, cyp, zz), a2 = proj(ex, ey, zz);
          ctx.strokeStyle = ledC; ctx.globalAlpha = on; ctx.lineWidth = Math.max(1, cam.scale * 0.035);
          ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke(); ctx.globalAlpha = 1;
          void fxN; void fyN;
        }
        continue;
      } else {
        fill = shade(base, nx, ny, nz);
      }
      poly(idx.map((i) => P[i]), fill);
    }
  }

  function drawSphere(s) {
    const [px, py] = proj(s.x, s.y, s.z);
    const r = s.r * cam.scale;
    const c = colorOf(s.color);
    const [R, G, B] = rgb(c);
    const k = pal.ambient + pal.diffuse;
    const g = ctx.createRadialGradient(px - r * 0.35, py - r * 0.4, r * 0.1, px, py, r);
    g.addColorStop(0, `rgb(${Math.min(255, R * k * 1.12) | 0},${Math.min(255, G * k * 1.12) | 0},${Math.min(255, B * k * 1.12) | 0})`);
    g.addColorStop(1, `rgb(${R * pal.ambient * 0.8 | 0},${G * pal.ambient * 0.8 | 0},${B * pal.ambient * 0.8 | 0})`);
    if (s.lamp) {
      ctx.save(); ctx.globalCompositeOperation = themeName === 'dark' ? 'lighter' : 'source-over';
      const gl = ctx.createRadialGradient(px, py, 0, px, py, r * 5);
      gl.addColorStop(0, c + 'aa'); gl.addColorStop(1, c + '00');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, py, r * 5, 0, TAU); ctx.fill(); ctx.restore();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, Math.max(2, r), 0, TAU); ctx.fill();
      return;
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, Math.max(1, r), 0, TAU); ctx.fill();
  }

  function floorPoly(x, y, w, d, fill) {
    poly([proj(x, y, 0), proj(x + w, y, 0), proj(x + w, y + d, 0), proj(x, y + d, 0)], fill);
  }
  function floorEllipse(x, y, rx, ry, fill) {
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * TAU; const p = proj(x + Math.cos(a) * rx, y + Math.sin(a) * ry, 0.002); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }

  function drawFloor(t) {
    // slab edge (thickness) for depth
    const T = 0.35;
    const corners = [[0, 0], [28, 0], [28, 18], [0, 18]];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
      const nx = Math.sign(by - ay), ny = -Math.sign(bx - ax);
      if (!facing(nx, ny, 0)) continue;
      poly([proj(ax, ay, 0), proj(bx, by, 0), proj(bx, by, -T), proj(ax, ay, -T)], shade(pal.floor, nx, ny, 0, 0.7));
    }
    floorPoly(0, 0, 28, 18, pal.floor);
    for (const r of ROOMS) floorPoly(r.x, r.y, r.w, r.d, pal.rooms[r.id]);
    // grid
    ctx.strokeStyle = pal.line; ctx.lineWidth = 1; ctx.beginPath();
    for (let gx = 1; gx < 28; gx++) { const a = proj(gx, 0, 0), b = proj(gx, 18, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let gy = 1; gy < 18; gy++) { const a = proj(0, gy, 0), b = proj(28, gy, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    // rugs
    floorPoly(20.0, 1.2, 4.4, 2.6, pal.rug);
    floorPoly(12.6, 2.2, 2.8, 2.4, pal.rug);
    // soft shadows under desks
    for (const def of Object.values(DESKS)) floorEllipse(def.x + def.f[0] * 0.5, def.y + def.f[1] * 0.5, 1.15, 1.15, pal.shadow.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.55).toFixed(2) + ')'));
    // status glow rings
    ctx.save();
    if (themeName === 'dark') ctx.globalCompositeOperation = 'lighter';
    for (const [id, a] of Object.entries(agents)) {
      const def = DESKS[id]; if (!def) continue;
      const st = a.state.stale ? 'idle' : a.state.status || 'idle';
      if (st === 'idle') continue;
      const c = STATUS_COL[st];
      const pulse = reduced ? 1 : 0.75 + 0.25 * Math.sin(t * (st === 'working' ? 2.4 : 4) + a.phase);
      const cx = def.x + def.f[0] * 0.35, cy = def.y + def.f[1] * 0.35;
      const p = proj(cx, cy, 0);
      const rad = 1.7 * cam.scale;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
      g.addColorStop(0, c + Math.round(70 * pal.glow * pulse).toString(16).padStart(2, '0'));
      g.addColorStop(1, c + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(p[0], p[1], rad, rad * sp, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // selection ring
    if (selected && DESKS[selected]) {
      const def = DESKS[selected];
      ctx.save(); ctx.setLineDash([5, 5]); ctx.lineDashOffset = reduced ? 0 : -t * 20;
      ctx.strokeStyle = agents[selected] ? agents[selected].def.reng : '#fff'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) { const a = (i / 32) * TAU; const p = proj(def.x + def.f[0] * 0.4 + Math.cos(a) * 1.25, def.y + def.f[1] * 0.4 + Math.sin(a) * 1.25, 0.01); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke(); ctx.restore();
    }
  }

  function anchor(id) {
    if (DESKS[id]) { const d = DESKS[id]; return [d.x, d.y, 1.6]; }
    const p = POINTS[id];
    return p ? [p.x, p.y, p.z] : null;
  }

  function drawFlows(t) {
    const now = performance.now();
    for (let i = flows.length - 1; i >= 0; i--) {
      const fl = flows[i];
      const age = (now - fl.t0) / 1000;
      if (age > 9) { flows.splice(i, 1); continue; }
      const A = anchor(fl.from), B = anchor(fl.to);
      if (!A || !B) { flows.splice(i, 1); continue; }
      const a = proj(...A), b = proj(...B);
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.min(160, dist * 0.35);
      const alpha = age < 6 ? 1 : 1 - (age - 6) / 3;
      const col = fl.color;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha) * 0.9;
      ctx.lineWidth = 2.2; ctx.strokeStyle = col; ctx.setLineDash([7, 6]); ctx.lineDashOffset = reduced ? 0 : -age * 40;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke();
      ctx.setLineDash([]);
      // travelling packet
      const k = reduced ? 1 : Math.min(1, age / 1.6);
      const qx = (1 - k) * (1 - k) * a[0] + 2 * (1 - k) * k * mx + k * k * b[0];
      const qy = (1 - k) * (1 - k) * a[1] + 2 * (1 - k) * k * my + k * k * b[1];
      if (themeName === 'dark') ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(qx, qy, 0, qx, qy, 18);
      g.addColorStop(0, col); g.addColorStop(1, col + '00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(qx, qy, 18, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(qx, qy, 4, 0, TAU); ctx.fill();
      // end markers
      ctx.beginPath(); ctx.arc(a[0], a[1], 3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(b[0], b[1], 5, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- labels (HTML overlay) ----------
  const tagEls = {}, roomEls = {};
  let onSelectCb = () => {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const ST_AZ = { working: 'işləyir', waiting: 'səni gözləyir', blocked: 'bloklanıb', idle: 'boşdur' };

  function ensureTag(id) {
    if (tagEls[id]) return tagEls[id];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tag';
    el.addEventListener('click', (e) => { e.stopPropagation(); select(id); onSelectCb(id); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    labelsEl.appendChild(el);
    return (tagEls[id] = el);
  }
  function renderTag(id) {
    const a = agents[id]; const el = ensureTag(id);
    const st = a.state.stale ? 'idle' : a.state.status || 'idle';
    const nowTxt = st === 'working' ? (a.state.step ? a.state.step.text : a.state.task || 'işləyir') : st === 'idle' ? '' : (a.state.task || a.state.note || ST_AZ[st]);
    const key = [st, a.def.ad, a.def.is, nowTxt, selected === id].join('|');
    if (el._k === key) return;
    el._k = key; el._w = 0;
    el.className = 'tag ' + st + (selected === id ? ' sel' : '');
    el.setAttribute('aria-label', `${a.def.ad}, ${ST_AZ[st]}. ${a.def.is}`);
    el.innerHTML = `<span class="nm"><span class="dot ${st}"></span>${esc(a.def.ad)}<i>${esc(ST_AZ[st])}</i></span><span class="job">${esc(a.def.is)}</span>${nowTxt ? `<span class="now">${esc(nowTxt)}</span>` : ''}`;
  }
  function placeLabels() {
    const items = [];
    for (const id of Object.keys(agents)) {
      const d = DESKS[id]; if (!d) continue;
      renderTag(id);
      const p = proj(d.x, d.y, 1.75);
      items.push({ id, p });
    }
    // place nearest first, push overlapping labels upward (simple greedy de-overlap)
    items.sort((a, b) => b.p[2] - a.p[2]);
    const placed = [];
    items.forEach((it, i) => {
      const el = tagEls[it.id];
      // labels stay small (name + status dot) so they never cover each other; details live in the side panel and the activity list
      if (!el.classList.contains('compact')) { el.classList.add('compact'); el._w = 0; }
      if (!el._w) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
      const w = el._w, h = el._h;
      let x = it.p[0], y = it.p[1];
      for (let k = 0; k < 6; k++) {
        const clash = placed.find((r) => Math.abs(r.x - x) < (r.w + w) / 2 + 4 && y > r.y - r.h - h + 2 && y - h < r.y + 2);
        if (!clash) break;
        y = clash.y - clash.h - 4;
      }
      placed.push({ x, y, w, h });
      el.style.transform = `translate(${x | 0}px, ${y | 0}px) translate(-50%, -100%)`;
      el.style.zIndex = String(200 - i + (selected === it.id ? 300 : 0));
      el.classList.toggle('hov', hovered === it.id);
    });
    for (const r of ROOMS) {
      let el = roomEls[r.id];
      if (!el) { el = roomEls[r.id] = document.createElement('div'); el.className = 'room-tag'; el.textContent = r.name; labelsEl.appendChild(el); }
      const p = proj(r.x + r.w / 2, r.y + 0.55, 0);
      el.style.left = (p[0] | 0) + 'px'; el.style.top = (p[1] | 0) + 'px';
    }
  }

  // ---------- frame ----------
  let lastFrame = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastFrame < 1000 / 31) return; // ~30 fps keeps the laptop cool
    lastFrame = ts;
    const t = ts / 1000;
    if (cam.tYaw != null) {
      const dlt = cam.tYaw - cam.yaw;
      cam.yaw += reduced ? dlt : dlt * 0.18;
      if (Math.abs(dlt) < 0.002) { cam.yaw = cam.tYaw; cam.tYaw = null; }
    }
    updTrig();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75);
    bg.addColorStop(0, pal.bg2); bg.addColorStop(1, pal.bg1);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    drawFloor(t);
    const objs = statics.concat(agentObjects(t));
    for (const o of objs) o._d = o.t === 'box' ? depth(o.x + o.w / 2, o.y + o.d / 2, o.z + o.h / 2) : depth(o.x, o.y, o.z);
    objs.sort((a, b) => a._d - b._d);
    for (const o of objs) (o.t === 'box' ? drawBox(o, t) : drawSphere(o));
    drawFlows(t);
    placeLabels();
  }

  let userZoomed = false;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (!userZoomed && W > 0) fit();
  }
  function fit() {
    // fit the projected floor (plus room for people/labels) into the free area under the top bar
    updTrig();
    const s0 = cam.scale; cam.scale = 1; cam.panX = 0; cam.panY = 0;
    const pts = [[0, 0, 0], [28, 0, 0], [28, 18, 0], [0, 18, 0], [0, 18, 2.6], [28, 18, 2.6]].map((p) => proj(...p));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    cam.scale = Math.max(12, Math.min((W - 24 - insetL) / bw, (H - 110) / bh));
    if (!isFinite(cam.scale)) cam.scale = s0;
    const q = [[0, 0, 0], [28, 0, 0], [28, 18, 0], [0, 18, 0], [0, 18, 2.6], [28, 18, 2.6]].map((p) => proj(...p));
    const cx = (Math.max(...q.map((p) => p[0])) + Math.min(...q.map((p) => p[0]))) / 2;
    const cyy = (Math.max(...q.map((p) => p[1])) + Math.min(...q.map((p) => p[1]))) / 2;
    cam.panX = insetL + (W - insetL) / 2 - cx; cam.panY = (H + 40) / 2 - cyy;
  }

  // ---------- interaction ----------
  function hit(mx, my) {
    let best = null, bd = 1e9;
    for (const id of Object.keys(agents)) {
      const d = DESKS[id]; if (!d) continue;
      const p = proj(d.x, d.y, 1.0);
      const dist = Math.hypot(p[0] - mx, p[1] - my);
      if (dist < Math.max(26, cam.scale * 0.9) && dist < bd) { bd = dist; best = id; }
    }
    return best;
  }
  function select(id) { selected = id; for (const k of Object.keys(tagEls)) tagEls[k]._k = null; }

  function bind() {
    const pts = new Map();
    let start = null, moved = false, pinch0 = null;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      start = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, px: cam.panX, py: cam.panY, pan: e.button === 2 || e.shiftKey };
      moved = false; cam.tYaw = null;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: cam.scale }; }
      canvas.classList.add('drag');
    });
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (!pts.has(e.pointerId)) {
        const h = hit(e.clientX - r.left, e.clientY - r.top);
        if (h !== hovered) { hovered = h; canvas.classList.toggle('hover', !!h); }
        return;
      }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch0) {
        const [a, b] = [...pts.values()];
        cam.scale = Math.max(12, Math.min(120, pinch0.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0.d)); userZoomed = true;
        moved = true; return;
      }
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (start.pan) { cam.panX = start.px + dx; cam.panY = start.py + dy; }
      else { cam.yaw = start.yaw + dx * 0.0075; cam.pitch = Math.max(0.42, Math.min(1.35, start.pitch + dy * 0.005)); }
    });
    const up = (e) => {
      const r = canvas.getBoundingClientRect();
      if (pts.has(e.pointerId) && !moved && pts.size === 1) {
        const h = hit(e.clientX - r.left, e.clientY - r.top);
        select(h); onSelectCb(h);
      }
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch0 = null;
      if (!pts.size) canvas.classList.remove('drag');
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.scale = Math.max(12, Math.min(120, cam.scale * Math.exp(-e.deltaY * 0.0012))); userZoomed = true;
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (/input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
      if (e.key === 'ArrowLeft') rotate(-Math.PI / 8);
      else if (e.key === 'ArrowRight') rotate(Math.PI / 8);
      else if (e.key === 'ArrowUp') cam.pitch = Math.min(1.35, cam.pitch + 0.08);
      else if (e.key === 'ArrowDown') cam.pitch = Math.max(0.42, cam.pitch - 0.08);
      else if (e.key === '+' || e.key === '=') zoom(1.15);
      else if (e.key === '-') zoom(1 / 1.15);
    });
    window.addEventListener('resize', () => { resize(); });
  }

  function rotate(d) { cam.tYaw = (cam.tYaw == null ? cam.yaw : cam.tYaw) + d; }
  function zoom(f) { userZoomed = true; cam.scale = Math.max(12, Math.min(120, cam.scale * f)); }
  function reset() { userZoomed = false; cam.tYaw = -0.62; cam.pitch = 0.66; fit(); }

  // ---------- public API ----------
  const Office = {
    init(cv, lbl) {
      canvas = cv; labelsEl = lbl; ctx = canvas.getContext('2d');
      resize(); fit(); buildStatics(); bind();
      requestAnimationFrame(frame);
    },
    setInset(px) { if (px !== insetL) { insetL = px; if (!userZoomed && W > 0) fit(); } },
    setTheme(name) { themeName = name === 'light' ? 'light' : 'dark'; pal = PAL[themeName]; },
    setAgents(list) {
      list.forEach((def, i) => {
        if (!agents[def.id]) agents[def.id] = { def, state: def.state || {}, phase: i * 1.7, skin: i % SKIN.length };
        agents[def.id].def = def;
        agents[def.id].state = def.state || {};
      });
    },
    flow(from, to, kind) {
      const col = kind === 'lab' ? '#7cc6ff' : kind === 'done' ? '#4ade80' : kind === 'call' ? '#f2c14e' : (agents[from] && agents[from].def.reng) || '#f2c14e';
      flows.push({ from, to, t0: performance.now(), color: col });
      if (flows.length > 12) flows.shift();
    },
    select, rotate, zoom, reset,
    onSelect(cb) { onSelectCb = cb; },
    focus(id) {
      const d = DESKS[id]; if (!d) return;
      const p = proj(d.x, d.y, 0);
      cam.panX += W / 2 - p[0]; cam.panY += H / 2 + 40 - p[1];
    },
  };
  window.Office = Office;
})();
