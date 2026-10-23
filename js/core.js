/* =========================================================
   深渊回响 — 核心工具 / 随机 / 输入 / 音效 / 粒子
   ========================================================= */

'use strict';

const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const sign = v => (v < 0 ? -1 : 1);
const fmtTime = s => {
  s = Math.max(0, Math.floor(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

/* ---------------- 可复现随机 (mulberry32) ---------------- */
let _seed = 20261021;
let _rs = _seed;
function seedRandom(s) { _seed = (s >>> 0) || 1; _rs = _seed; }
function seedOf() { return _seed; }
function RNG() {
  _rs |= 0;
  _rs = (_rs + 0x6D2B79F5) | 0;
  let t = Math.imul(_rs ^ (_rs >>> 15), 1 | _rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rnd = (a = 1, b = 0) => b + RNG() * (a - b);
const rndInt = (a, b) => Math.floor(rnd(b, a));
const pick = arr => arr[Math.floor(RNG() * arr.length)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(RNG() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ---------------- 输入 ---------------- */
const Input = {
  keys: Object.create(null),
  pressed: Object.create(null),
  mouse: { x: 0, y: 0, down: false, clicked: false, moved: false },

  init(canvas) {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
      if (e.code === 'Space' || e.code === 'Tab' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.moved = true;
    });
    canvas.addEventListener('mousedown', e => {
      this.mouse.down = true;
      this.mouse.clicked = true;
      this.mouse.moved = true;
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  down(k) { return !!this.keys[k]; },
  hit(k) { return !!this.pressed[k]; },

  axis() {
    const x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) -
              (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    const y = (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0) -
              (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0);
    if (x && y) {
      const inv = Math.SQRT1_2;
      return { x: x * inv, y: y * inv };
    }
    return { x, y };
  },

  endFrame() {
    this.pressed = Object.create(null);
    this.mouse.clicked = false;
  }
};

/* ---------------- 音效 (纯合成, 无素材) ---------------- */
const Sfx = {
  enabled: true,
  ac: null,
  master: null,
  _last: Object.create(null),

  init() {
    if (this.ac) return;
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return;
    try {
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ac.destination);
    } catch (err) {
      this.ac = null;
    }
  },

  resume() {
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },

  tone(f0, f1, dur, type, vol, delay) {
    if (!this.enabled || !this.ac) return;
    const t0 = this.ac.currentTime + (delay || 0);
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  },

  play(name) {
    if (!this.enabled || !this.ac) return;
    const now = this.ac.currentTime;
    const gates = { shoot: 0.06, hit: 0.035, kill: 0.03, pick: 0.04, hurt: 0.1, coin: 0.04, buy: 0.08 };
    const gate = gates[name] || 0;
    if (gate && this._last[name] && now - this._last[name] < gate) return;
    this._last[name] = now;

    switch (name) {
      case 'shoot': this.tone(920, 620, 0.055, 'square', 0.03); break;
      case 'hit': this.tone(250, 150, 0.045, 'triangle', 0.05); break;
      case 'kill': this.tone(380, 90, 0.11, 'sawtooth', 0.05); break;
      case 'hurt': this.tone(190, 60, 0.22, 'square', 0.13); break;
      case 'pick': this.tone(1250, 1750, 0.05, 'sine', 0.035); break;
      case 'coin': this.tone(1568, 2093, 0.07, 'sine', 0.045); break;
      case 'buy':
        this.tone(660, 660, 0.07, 'triangle', 0.06);
        this.tone(990, 990, 0.1, 'triangle', 0.07, 0.06);
        break;
      case 'level':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.13, 'triangle', 0.09, i * 0.07));
        break;
      case 'boss': this.tone(72, 40, 1.1, 'sawtooth', 0.18); break;
      case 'breath':
        this.tone(165, 52, 0.62, 'sawtooth', 0.10);
        this.tone(310, 96, 0.38, 'triangle', 0.055, 0.03);
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, f, 0.28, 'triangle', 0.1, i * 0.11));
        break;
      case 'lose':
        [420, 330, 250, 160].forEach((f, i) => this.tone(f, f * 0.9, 0.3, 'sawtooth', 0.1, i * 0.14));
        break;
    }
  }
};

/* ---------------- 粒子 / 飘字 ---------------- */
const FX = {
  parts: [],
  texts: [],
  lines: [],
  arcs: [],

  reset() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.lines.length = 0;
    this.arcs.length = 0;
  },

  spark(x, y, color, n, speed, life, size) {
    n = n || 6; speed = speed || 150; life = life || 0.45; size = size || 3;
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU);
      const s = speed * rnd(1, 0.25);
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life, size: size * rnd(1.4, 0.6), color
      });
    }
  },

  ring(x, y, r, color, life) {
    this.parts.push({ x, y, vx: 0, vy: 0, life: life || 0.4, max: life || 0.4, size: r, color, ring: true });
  },

  bolt(x1, y1, x2, y2, color, life) {
    this.lines.push({ x1, y1, x2, y2, color, life: life || 0.16, max: life || 0.16 });
  },

  arc(x, y, r, a0, a1, color, life) {
    this.arcs.push({
      x, y, r, a0, a1, color,
      life: life || 0.18, max: life || 0.18
    });
  },

  text(x, y, str, color, size, life) {
    if (this.texts.length > 90) this.texts.shift();
    this.texts.push({
      x, y, str, color,
      size: size || 13,
      life: life || 0.62,
      max: life || 0.62,
      vy: -46, vx: rnd(22, -22)
    });
  },

  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      if (!p.ring) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
    }
    const ts = this.texts;
    for (let i = ts.length - 1; i >= 0; i--) {
      const t = ts[i];
      t.life -= dt;
      if (t.life <= 0) { ts.splice(i, 1); continue; }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy *= 0.94;
    }
    const ls = this.lines;
    for (let i = ls.length - 1; i >= 0; i--) {
      ls[i].life -= dt;
      if (ls[i].life <= 0) ls.splice(i, 1);
    }
    const as = this.arcs;
    for (let i = as.length - 1; i >= 0; i--) {
      as[i].life -= dt;
      if (as[i].life <= 0) as.splice(i, 1);
    }
  },

  draw(ctx) {
    // 火花
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      const k = p.life / p.max;
      ctx.globalAlpha = k;
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5 * k + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    // 闪电
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i];
      const k = l.life / l.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 2 + 3 * k;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      const mx = (l.x1 + l.x2) / 2 + rnd(14, -14);
      const my = (l.y1 + l.y2) / 2 + rnd(14, -14);
      ctx.lineTo(mx, my);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
    }
    // 扇形斩击
    for (let i = 0; i < this.arcs.length; i++) {
      const a = this.arcs[i];
      const k = a.life / a.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3 * k + 1;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, a.a0, a.a1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 伤害数字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      const k = clamp(t.life / t.max, 0, 1);
      ctx.globalAlpha = k > 0.6 ? 1 : k / 0.6;
      ctx.font = '700 ' + Math.round(t.size) + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillText(t.str, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
};

/* ---------------- 素材加载 (没有图时全部回退矢量) ---------------- */
const Assets = {
  map: Object.create(null),
  inited: false,
  _warned: Object.create(null),

  init() {
    if (this.inited) return this;
    this.inited = true;
    if (typeof Image === 'undefined' || typeof CONTENT === 'undefined' || !CONTENT.assets) return this;

    const conf = CONTENT.assets;
    const base = conf.basePath || '';
    for (const cat in conf) {
      if (cat === 'basePath') continue;
      const group = conf[cat];
      if (!group || typeof group !== 'object') continue;
      for (const key in group) {
        const val = group[key];
        if (!val) continue;
        const opt = typeof val === 'string' ? { src: val } : val;
        if (!opt.src) continue;
        const entry = {
          src: base + opt.src,
          ready: false,
          failed: false,
          img: null,
          frames: opt.frames || 1,
          frameW: opt.frameW || 0,
          frameH: opt.frameH || 0,
          fps: opt.fps || 8
        };
        const img = new Image();
        img.onload = () => { entry.ready = true; };
        img.onerror = () => {
          entry.failed = true;
          if (!this._warned[entry.src]) {
            this._warned[entry.src] = true;
            if (typeof console !== 'undefined') console.warn('[assets] 缺少图片, 使用矢量回退: ' + entry.src);
          }
        };
        img.src = entry.src;
        entry.img = img;
        this.map[cat + ':' + key] = entry;
      }
    }
    return this;
  },

  entry(cat, key) {
    return this.map[cat + ':' + key] || null;
  },

  /* 画成功返回 true, 没图/没加载好返回 false, 让调用方回退矢量 */
  draw(ctx, cat, key, x, y, w, h, opt) {
    const e = this.entry(cat, key);
    if (!e || !e.ready || !e.img) return false;
    opt = opt || {};
    const img = e.img;
    let sw = img.width;
    let sh = img.height;
    let sx = 0;
    let sy = 0;
    if (e.frames > 1 && e.frameW > 0 && e.frameH > 0) {
      const f = Math.floor((opt.time || 0) * e.fps) % e.frames;
      sx = f * e.frameW;
      sy = 0;
      sw = e.frameW;
      sh = e.frameH;
    }
    ctx.save();
    ctx.translate(x, y);
    if (opt.rot) ctx.rotate(opt.rot);
    if (opt.flipX) ctx.scale(-1, 1);
    if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
    ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  },

  /* 背景/大图用: 保持比例铺满目标矩形, 多余部分居中裁掉 */
  drawCover(ctx, cat, key, x, y, w, h, opt) {
    const e = this.entry(cat, key);
    if (!e || !e.ready || !e.img) return false;
    const img = e.img;
    const iw = img.width, ih = img.height;
    if (!iw || !ih) return false;
    opt = opt || {};
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;
    ctx.save();
    ctx.translate(x, y);
    if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
    ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  },

  /* 技能/被动图标, 没图返回 false */
  icon(ctx, key, x, y, size, opt) {
    opt = opt || {};
    return this.draw(ctx, 'skill', key, x, y, size, size, {
      time: opt.time,
      flipX: opt.flipX,
      alpha: opt.alpha
    });
  },

  /* 天赋节点图标 (assets/talent/*.png), 没图返回 false */
  talentIcon(ctx, key, x, y, size, opt) {
    opt = opt || {};
    return this.draw(ctx, 'talent', key, x, y, size, size, {
      time: opt.time,
      flipX: opt.flipX,
      alpha: opt.alpha
    });
  }
};

/* ---------------- 小工具 ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function polyPath(ctx, x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i * TAU / sides;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/* 空间网格: 敌人碰撞加速 */
class Grid {
  constructor(cell) {
    this.cell = cell || 72;
    this.map = new Map();
  }

  clear() { this.map.clear(); }

  _key(cx, cy) { return cx + ',' + cy; }

  insert(e) {
    const cx = Math.floor(e.x / this.cell);
    const cy = Math.floor(e.y / this.cell);
    const k = this._key(cx, cy);
    let bucket = this.map.get(k);
    if (!bucket) { bucket = []; this.map.set(k, bucket); }
    bucket.push(e);
  }

  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.map.get(this._key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }
}
