/* =========================================================
   深渊回响 — 特效层 (v0.5)
   程序化攻击演出: 挥砍 / 施法 / 爆炸 / 暴风雪 / 火雨 / 闪电
   设计原则:
   - 全部用 Canvas 程序化绘制, 不依赖额外贴图, 缺图也能保持完整演出。
   - 视觉随机使用 Math.random(), 不消耗战斗 RNG, 不影响种子复现和平衡。
   - 所有特效有寿命和数量上限, 不会随怪物数量无限增长。
   ========================================================= */

'use strict';

/* ---------------- 颜色 / 小工具 ---------------- */

const VFX_PALETTE = {
  gold:    ['#fffbe0', '#ffe066', '#ffb020', '#5a3a00'],
  holy:    ['#ffffff', '#ffe9a8', '#ffc04d', '#5a3a00'],
  fire:    ['#fff3c4', '#ffb340', '#ff5a1f', '#5a1c06'],
  pyro:    ['#fff8d6', '#ff9f1a', '#e0300a', '#2a0c05'],
  ice:     ['#ffffff', '#bdefff', '#54b6ff', '#1b3f7a'],
  arcane:  ['#ffffff', '#d8c7ff', '#8b5cf6', '#2e1a5e'],
  thunder: ['#ffffff', '#d0bfff', '#7c4dff', '#24104d'],
  blood:   ['#ffd6dc', '#ff6b8b', '#c9184a', '#3a0614'],
  nature:  ['#eaffd6', '#8ce99a', '#2f9e44', '#08240d'],
  poison:  ['#eaffd6', '#8ce99a', '#2f9e44', '#08240d'],
  shadow:  ['#e6d6ff', '#b197fc', '#6f2dbd', '#160b2e'],
  void:    ['#f0e6ff', '#c77dff', '#7b2cbf', '#0d0518'],
  abyss:   ['#fff0ff', '#ff8bf0', '#a02c8f', '#22051f'],
  hex:     ['#f3e0ff', '#c77dff', '#6a2c91', '#180a22'],
  dragon:  ['#fff1c9', '#ffb347', '#ff5d2e', '#4a1204'],
  bolt:    ['#ffffff', '#9bd7ff', '#4dabf7', '#123a5e']
};

function vfxPal(style) {
  return VFX_PALETTE[style] || VFX_PALETTE.bolt;
}

const _vfxRgbaCache = new Map();
function vfxRgba(hex, a) {
  if (!hex) return 'rgba(255,255,255,' + a + ')';
  if (hex.indexOf('rgb') === 0) return hex;
  const key = hex + '|' + a;
  const hit = _vfxRgbaCache.get(key);
  if (hit) return hit;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  const out = 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  if (_vfxRgbaCache.size < 900) _vfxRgbaCache.set(key, out);
  return out;
}

function vfxHash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function vfxEase(t) {
  t = clamp(t, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function vfxRnd(a, b) {
  if (b === undefined) return Math.random() * a;
  return a + Math.random() * (b - a);
}

function vfxGlow(ctx, x, y, r, color, a) {
  if (r <= 0.1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, vfxRgba(color, a));
  g.addColorStop(0.5, vfxRgba(color, a * 0.42));
  g.addColorStop(1, vfxRgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function vfxSoft(ctx, x, y, rx, ry, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, 1));
  g.addColorStop(0, vfxRgba(color, a));
  g.addColorStop(0.6, vfxRgba(color, a * 0.4));
  g.addColorStop(1, vfxRgba(color, 0));
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, Math.max(0.05, ry / Math.max(rx, 1)));
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ---------------- 特效池 ---------------- */

const VFX = {
  items: [],
  maxItems: 190,
  // 特效密度系数: ?lowfx=1 时降到 0.5, 密集战斗/低配机用
  quality: 1,

  reset() {
    this.items.length = 0;
  },

  /* 按质量系数裁剪粒子数, 至少保留 2 个 */
  count(n) {
    return Math.max(2, Math.round(n * this.quality));
  },

  push(o) {
    o.t = 0;
    o.life = o.life || 0.4;
    o.seed = o.seed === undefined ? Math.random() * 100 : o.seed;
    o.layer = o.layer || 'over';
    if (this.items.length >= this.maxItems) this.items.shift();
    this.items.push(o);
    return o;
  },

  update(dt) {
    const list = this.items;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      it.t += dt;
      if (it.t >= it.life) {
        if (it.type === 'burst' && it.follow) it.follow = null;
        list.splice(i, 1);
      }
    }
  },

  /* ---------------- 生成接口 ---------------- */

  slash(x, y, a, r, arc, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'slash', x, y, a, r, arc: arc || 1.6,
      style: style || 'gold', color: color || vfxPal(style)[1],
      life: opt.life || (opt.heavy ? 0.34 : 0.27),
      heavy: !!opt.heavy, layer: 'over'
    });
  },

  cone(x, y, a, r, arc, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'cone', x, y, a, r, arc: arc || 1.2,
      style: style || 'fire', color: color || vfxPal(style)[1],
      life: opt.life || 0.36, layer: 'over'
    });
  },

  /* 龙息: 地面焦痕 + 多层火舌 / 余烬 / 烟 / 热浪, 单独做比通用 cone 更华丽 */
  breath(x, y, a, r, arc, style, color, opt) {
    opt = opt || {};
    const seed = opt.seed === undefined ? Math.random() * 100 : opt.seed;
    this.push({
      type: 'breath_ground', x, y, a, r, arc: arc || 1.3,
      style: style || 'dragon', color: color || vfxPal(style)[1],
      life: opt.groundLife || 1.05, seed, layer: 'ground'
    });
    return this.push({
      type: 'breath', x, y, a, r, arc: arc || 1.3,
      style: style || 'dragon', color: color || vfxPal(style)[1],
      life: opt.life || 0.78, seed, layer: 'over'
    });
  },

  burst(x, y, r, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'burst', x, y, r: r || 60,
      style: style || 'fire', color: color || vfxPal(style)[1],
      life: opt.life || 0.56, heavy: !!opt.heavy, layer: 'over'
    });
  },

  shock(x, y, r, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'shock', x, y, r: r || 70,
      style: style || 'gold', color: color || vfxPal(style)[1],
      life: opt.life || 0.42, heavy: !!opt.heavy, layer: 'ground'
    });
  },

  cast(x, y, r, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'cast', x, y, r: r || 44,
      style: style || 'arcane', color: color || vfxPal(style)[1],
      life: opt.life || 0.7, layer: 'ground'
    });
  },

  aura(x, y, r, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'aura', x, y, r: r || 40,
      style: style || 'gold', color: color || vfxPal(style)[1],
      life: opt.life || 0.8, layer: 'over'
    });
  },

  lightning(x1, y1, x2, y2, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'lightning', x1, y1, x2, y2,
      style: style || 'thunder', color: color || vfxPal(style)[1],
      life: opt.life || 0.18, layer: 'over'
    });
  },

  impact(x, y, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'impact', x, y,
      style: style || 'bolt', color: color || vfxPal(style)[1],
      life: opt.life || 0.17, layer: 'over'
    });
  },

  dust(x, y, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'dust', x, y,
      style: style || 'gold', color: color || vfxPal(style)[2],
      life: opt.life || 0.46, layer: 'ground'
    });
  },

  /* 裂地: 地面裂纹 + 碎石 + 冲击环 + 尘土, 用于踩地板类重击 */
  slam(x, y, r, style, color, opt) {
    opt = opt || {};
    const st = style || 'gold';
    const c = color || vfxPal(st)[1];
    const seed = opt.seed === undefined ? Math.random() * 100 : opt.seed;
    this.push({
      type: 'crack', x, y, r: r || 90, style: st, color: c, seed,
      life: opt.crackLife || 1.15, layer: 'ground'
    });
    this.push({
      type: 'debris', x, y, r: r || 90, style: st, color: c, seed: seed + 7,
      n: this.count(opt.debris || 16), life: 0.62, layer: 'over'
    });
    this.shock(x, y, (r || 90) * 1.05, st, c, { heavy: true, life: 0.45 });
    this.dust(x, y, st, c, { life: 0.55 });
    return this.items[this.items.length - 1];
  },

  /* 奥爆: 能量力场炸裂(球体 + 六边形网格 + 符文环 + 碎片) */
  pulse(x, y, r, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'pulse', x, y, r: r || 90,
      style: style || 'arcane', color: color || vfxPal(style)[1],
      life: opt.life || 0.62, heavy: !!opt.heavy, layer: 'over'
    });
  },

  /* 旋风: 地面风环 + 螺旋气流 + 环绕刀光 + 内吸碎屑 */
  spin(x, y, r, style, color, opt) {
    opt = opt || {};
    return this.push({
      type: 'whirl', x, y, r: r || 110,
      style: style || 'gold', color: color || vfxPal(style)[1],
      life: opt.life || 0.55, heavy: !!opt.heavy, layer: 'over'
    });
  },

  /* ---------------- 每帧绘制 ---------------- */

  draw(ctx, layer) {
    const list = this.items;
    ctx.save();
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.layer !== layer) continue;
      switch (it.type) {
        case 'slash': this._slash(ctx, it); break;
        case 'cone': this._cone(ctx, it); break;
        case 'breath': this._breath(ctx, it); break;
        case 'breath_ground': this._breathGround(ctx, it); break;
        case 'burst': this._burst(ctx, it); break;
        case 'shock': this._shock(ctx, it); break;
        case 'cast': this._cast(ctx, it); break;
        case 'aura': this._aura(ctx, it); break;
        case 'lightning': this._lightning(ctx, it); break;
        case 'impact': this._impact(ctx, it); break;
        case 'dust': this._dust(ctx, it); break;
        case 'crack': this._crack(ctx, it); break;
        case 'debris': this._debris(ctx, it); break;
        case 'whirl': this._whirl(ctx, it); break;
        case 'pulse': this._pulse(ctx, it); break;
      }
    }
    ctx.restore();
  },

  /* 刀光: 拖影扇面 + 月牙刃身 + 残影 + 刃口高光 + 重击火花
     旧版是一条圆弧描边, 看不出「刃」; 现在按挥砍进度扫出一道有厚度、有收锋的形状。 */
  _slash(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const pal = vfxPal(it.style);
    const half = it.arc / 2;
    const swing = vfxEase(Math.min(1, k * 1.45));
    const lead = -half + it.arc * swing;
    const r = it.r;
    const fade = 1 - k;
    const heavy = !!it.heavy;

    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.a);
    ctx.globalCompositeOperation = 'lighter';

    // 1) 拖影扇面: 越靠近刃口越亮
    const trailStart = Math.max(-half, lead - it.arc * 0.95);
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a0 = trailStart + (lead - trailStart) * t0;
      const a1 = trailStart + (lead - trailStart) * t1 + 0.006;
      const g = Math.pow(t0, 1.7);
      if (g < 0.03) continue;
      const rr = r * (0.55 + 0.42 * g);
      ctx.globalAlpha = fade * 0.5 * g;
      ctx.strokeStyle = t0 > 0.72 ? pal[0] : (t0 > 0.34 ? pal[1] : pal[2]);
      ctx.lineWidth = r * (heavy ? 0.30 : 0.23) * (0.25 + 0.75 * g);
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a1);
      ctx.stroke();
    }

    // 2) 刃身: 内缘在 0.58r, 外缘 1.02r, 尖端收在挥砍前沿
    const bladeArc = Math.min(1.25, Math.max(0.55, it.arc * 0.8));
    const b0 = Math.max(-half - 0.12, lead - bladeArc);
    const tipR = r * 1.06;
    ctx.globalAlpha = fade * 0.92;
    const bg = ctx.createLinearGradient(
      Math.cos(b0) * r * 0.8, Math.sin(b0) * r * 0.8,
      Math.cos(lead) * tipR, Math.sin(lead) * tipR);
    bg.addColorStop(0, vfxRgba(pal[2], 0));
    bg.addColorStop(0.35, vfxRgba(pal[1], 0.55));
    bg.addColorStop(0.8, vfxRgba(pal[0], 0.85));
    bg.addColorStop(1, vfxRgba(pal[0], 0.95));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.02, b0, lead);
    ctx.lineTo(Math.cos(lead) * tipR, Math.sin(lead) * tipR);
    ctx.arc(0, 0, r * 0.58, lead, b0, true);
    ctx.closePath();
    ctx.fill();

    // 刃口高光: 只画靠尖端的一段, 才有「破空」的感觉
    ctx.globalAlpha = fade * 0.95;
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = heavy ? 3.4 : 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.01, b0 + bladeArc * 0.3, lead);
    ctx.stroke();

    // 3) 残影: 前一帧的刃位, 制造速度感
    for (let g = 1; g <= 2; g++) {
      const gl = lead - g * 0.17;
      if (gl < -half - 0.2) break;
      ctx.globalAlpha = fade * (0.28 - g * 0.09);
      ctx.strokeStyle = pal[1];
      ctx.lineWidth = (heavy ? 9 : 6) - g * 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.84, gl - 0.55, gl);
      ctx.stroke();
    }

    // 4) 尖端命中闪光
    if (k < 0.55) {
      const tipA = k < 0.2 ? k / 0.2 : (1 - (k - 0.2) / 0.35);
      vfxGlow(ctx, Math.cos(lead) * tipR, Math.sin(lead) * tipR,
        r * (heavy ? 0.34 : 0.24) * (0.6 + 0.4 * tipA),
        pal[0], Math.max(0, fade * tipA * 0.85));
    }

    // 5) 重击火花: 沿刃口飞出的短射线
    if (heavy) {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = lead + (vfxHash(i + it.seed) - 0.5) * 0.9;
        const r0 = r * (0.62 + vfxHash(i + 3 + it.seed) * 0.3);
        const len = (14 + vfxHash(i + 9 + it.seed) * 30) * (0.4 + fade);
        ctx.globalAlpha = fade * (0.45 + 0.5 * vfxHash(i + 13 + it.seed));
        ctx.strokeStyle = i % 3 === 0 ? pal[0] : pal[1];
        ctx.lineWidth = 1.4 + vfxHash(i + 5 + it.seed) * 1.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len));
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  _cone(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const pal = vfxPal(it.style);
    const grow = 0.35 + 0.65 * vfxEase(k);
    const r = it.r * grow;
    const half = it.arc / 2;

    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.a);
    ctx.globalCompositeOperation = 'lighter';

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(4, r));
    g.addColorStop(0, vfxRgba(pal[0], 0.24 * (1 - k)));
    g.addColorStop(0.35, vfxRgba(pal[1], 0.30 * (1 - k)));
    g.addColorStop(1, vfxRgba(pal[2], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -half, half);
    ctx.closePath();
    ctx.fill();

    // 火焰 / 冰晶 / 龙息: 沿锥形向外翻滚的团块
    const n = it.style === 'ice' ? 13 : 16;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const a = -half + it.arc * vfxHash(i + it.seed) + Math.sin(it.t * 13 + i) * 0.06;
      const rr = r * (0.12 + 0.88 * u);
      const size = r * (0.05 + 0.09 * (1 - u));
      const alpha = (1 - k) * (0.55 - u * 0.22) * (0.6 + 0.4 * vfxHash(i + 7 + it.seed));
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = vfxRgba(i % 3 === 0 ? pal[0] : pal[1], 0.9);
      ctx.beginPath();
      if (it.style === 'ice') {
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a + it.t * 5 + i);
        ctx.moveTo(size * 2.2, 0);
        ctx.lineTo(0, -size);
        ctx.lineTo(-size * 1.1, 0);
        ctx.lineTo(0, size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, size * (1 + 0.35 * Math.sin(it.t * 18 + i)), 0, TAU);
        ctx.fill();
      }
    }

    // 锥形边缘亮边
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-half) * r, Math.sin(-half) * r);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(half) * r, Math.sin(half) * r);
    ctx.stroke();
    ctx.restore();
  },

  /* 龙息地面层: 焦痕 + 熔岩裂纹 */
  _breathGround(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const fade = 1 - k;
    const pal = vfxPal(it.style);
    const grow = 0.4 + 0.6 * vfxEase(k);
    const r = it.r * grow;
    const half = it.arc / 2;

    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.a);

    // 扇形焦土
    const g = ctx.createRadialGradient(0, 0, r * 0.04, 0, 0, r);
    g.addColorStop(0, 'rgba(42,9,2,0.62)');
    g.addColorStop(0.55, 'rgba(26,7,3,0.34)');
    g.addColorStop(1, 'rgba(8,2,1,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -half, half);
    ctx.closePath();
    ctx.fill();

    // 熔岩裂纹
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 11; i++) {
      const a = -half + it.arc * ((i + 0.5) / 11) +
        (vfxHash(i + it.seed) - 0.5) * 0.035;
      const len = r * (0.42 + 0.55 * vfxHash(i * 5 + it.seed));
      ctx.globalAlpha = fade * (0.35 + 0.25 * vfxHash(i + 2 + it.seed));
      ctx.strokeStyle = i % 3 === 0 ? pal[0] : pal[2];
      ctx.lineWidth = 1 + 1.8 * vfxHash(i + 4 + it.seed);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.06, Math.sin(a) * r * 0.06);
      for (let j = 1; j <= 4; j++) {
        const u = j / 4;
        const aa = a + (vfxHash(i * 10 + j + it.seed) - 0.5) * 0.035;
        ctx.lineTo(Math.cos(aa) * len * u, Math.sin(aa) * len * u);
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  /* 龙息: 多层火舌、翻滚火团、余烬、烟和热浪 */
  _breath(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const fade = 1 - k;
    const pal = vfxPal(it.style);
    const ramp = Math.min(1, k * 1.65);
    const grow = 0.28 + 0.72 * vfxEase(ramp);
    const r = it.r * grow;
    const half = it.arc / 2;

    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.a);

    // 烟: 在火焰下面慢慢散开
    if (k > 0.08) {
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 10; i++) {
        const u = (i + 0.5) / 10;
        const a = -half * 1.06 + it.arc * 1.06 * u;
        const rr = r * (0.55 + 0.32 * vfxHash(i + it.seed));
        const alpha = fade * 0.11 * (0.45 + 0.55 * vfxHash(i + 3 + it.seed));
        vfxGlow(ctx, Math.cos(a) * rr, Math.sin(a) * rr,
          r * (0.16 + 0.10 * vfxHash(i + 7 + it.seed)), '#2c1a14', alpha);
      }
    }

    ctx.globalCompositeOperation = 'lighter';

    // 龙口核心光
    ctx.globalAlpha = fade * 0.9;
    vfxGlow(ctx, r * 0.18, 0, r * 0.34, pal[0], 0.75);
    vfxGlow(ctx, r * 0.55, 0, r * 0.55, pal[2], fade * 0.4);

    // 锯齿形锥体, 让边缘像翻卷的火焰而不是一个几何扇形
    ctx.save();
    ctx.beginPath();
    const steps = 30;
    ctx.moveTo(0, 0);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const a = -half + it.arc * u;
      const jag = 1 +
        0.085 * Math.sin(u * 23 + it.t * 27 + it.seed) +
        0.045 * Math.sin(u * 43 - it.t * 19 + it.seed * 2);
      const rr = r * jag * (0.90 + 0.10 * Math.sin(u * Math.PI));
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.clip();

    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(8, r));
    g.addColorStop(0, vfxRgba(pal[0], 0.62 * fade));
    g.addColorStop(0.20, vfxRgba(pal[1], 0.58 * fade));
    g.addColorStop(0.55, vfxRgba(pal[2], 0.42 * fade));
    g.addColorStop(0.86, vfxRgba('#a8200a', 0.24 * fade));
    g.addColorStop(1, vfxRgba('#3a0a02', 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r * 0.1, -r, r * 1.2, r * 2);

    // 锥体内滚动的亮带
    for (let i = 0; i < 7; i++) {
      const rr = r * (0.20 + i * 0.115);
      const wave = Math.sin(it.t * 18 + i * 1.9 + it.seed) * 0.07;
      ctx.globalAlpha = fade * (0.16 - i * 0.012);
      ctx.strokeStyle = i % 2 === 0 ? pal[0] : pal[1];
      ctx.lineWidth = 2.2 + i * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, rr, -half * 0.82 + wave, half * 0.82 + wave);
      ctx.stroke();
    }
    ctx.restore();

    // 火舌: 从龙口向外翻卷的尖舌
    const tongues = 22;
    for (let i = 0; i < tongues; i++) {
      const u = (i + 0.5) / tongues;
      const a = -half + it.arc * u +
        Math.sin(it.t * 19 + i * 2.1 + it.seed) * 0.035;
      const pulse = 0.70 + 0.30 * Math.sin(it.t * 25 + i * 1.7 + it.seed * 3);
      const rr = r * (0.54 + 0.46 * pulse) * (0.88 + 0.12 * vfxHash(i + it.seed));
      const w = 0.045 + 0.030 * vfxHash(i + 4 + it.seed);
      const base = r * 0.045;
      ctx.globalAlpha = fade * (0.45 + 0.25 * pulse);
      ctx.fillStyle = vfxRgba(i % 4 === 0 ? pal[0] : (i % 4 === 1 ? pal[1] : pal[2]), 0.85);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * base, Math.sin(a) * base);
      ctx.quadraticCurveTo(
        Math.cos(a - w) * rr * 0.55, Math.sin(a - w) * rr * 0.55,
        Math.cos(a - w * 0.32) * rr, Math.sin(a - w * 0.32) * rr
      );
      ctx.quadraticCurveTo(
        Math.cos(a) * rr * 1.10, Math.sin(a) * rr * 1.10,
        Math.cos(a + w * 0.32) * rr, Math.sin(a + w * 0.32) * rr
      );
      ctx.quadraticCurveTo(
        Math.cos(a + w) * rr * 0.55, Math.sin(a + w) * rr * 0.55,
        Math.cos(a) * base, Math.sin(a) * base
      );
      ctx.fill();
    }

    // 高亮火芯
    ctx.globalAlpha = fade * 0.75;
    const core = ctx.createLinearGradient(0, 0, r * 0.92, 0);
    core.addColorStop(0, vfxRgba(pal[0], 0.85));
    core.addColorStop(0.55, vfxRgba(pal[1], 0.42));
    core.addColorStop(1, vfxRgba(pal[2], 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.93, -half * 0.34, half * 0.34);
    ctx.closePath();
    ctx.fill();

    // 龙头: 张开下颚, 火焰从嘴里喷出
    this._dragonHead(ctx, it, r, pal, fade);

    // 前沿火环 + 热浪
    ctx.globalAlpha = fade * 0.55;
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.99, -half * 0.95, half * 0.95);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = fade * (0.20 - i * 0.05);
      ctx.strokeStyle = i === 0 ? pal[0] : pal[1];
      ctx.lineWidth = 1.2 + i;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.03 + i * 0.045) + Math.sin(it.t * 22 + i) * 4,
        -half * 0.82, half * 0.82);
      ctx.stroke();
    }

    // 余烬飞出锥体
    for (let i = 0; i < 26; i++) {
      const seed = vfxHash(i * 3.17 + it.seed);
      const travel = (it.t * (0.9 + 0.8 * seed) + vfxHash(i + 9 + it.seed)) % 1;
      const a = -half + it.arc * vfxHash(i + 0.37 + it.seed) +
        Math.sin(it.t * 7 + i) * 0.05;
      const d = r * (0.35 + 0.95 * travel);
      const size = 1.3 + 2.8 * seed;
      ctx.globalAlpha = fade * (1 - travel) * 0.95;
      ctx.fillStyle = i % 3 === 0 ? pal[0] : (i % 3 === 1 ? pal[1] : pal[2]);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, size, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = fade * (1 - travel) * 0.45;
      ctx.strokeStyle = pal[1];
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (d - size * 3), Math.sin(a) * (d - size * 3));
      ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      ctx.stroke();
    }

    ctx.restore();
  },

  _burst(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const e = vfxEase(k);
    const pal = vfxPal(it.style);
    const r = it.r;
    const style = it.style;

    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.globalCompositeOperation = 'lighter';

    // 地面闪光
    ctx.globalAlpha = (1 - k) * 0.8;
    vfxGlow(ctx, 0, 0, r * (0.5 + 0.65 * e), pal[1], 0.55);

    // 三层冲击环
    for (let ring = 0; ring < 3; ring++) {
      const rr = r * (0.18 + 0.82 * e) * (1 + ring * 0.16);
      ctx.globalAlpha = (1 - k) * (0.65 - ring * 0.15);
      ctx.strokeStyle = ring === 0 ? pal[0] : pal[1];
      ctx.lineWidth = (it.heavy ? 4 : 2.5) * (1 - k) + 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }

    // 放射光刺
    const rays = style === 'ice' ? 9 : 12;
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = 2;
    for (let i = 0; i < rays; i++) {
      const a = i * TAU / rays + it.seed + it.t * 0.4;
      const r0 = r * (0.12 + 0.3 * e);
      const r1 = r * (0.35 + 0.8 * e) * (0.65 + 0.35 * vfxHash(i + it.seed));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }

    // 风格化碎片
    const parts = it.heavy ? 18 : 13;
    for (let i = 0; i < parts; i++) {
      const a = i * TAU / parts + it.seed * 0.7 + Math.sin(it.t * 4 + i) * 0.12;
      const dist = r * (0.12 + 0.82 * e) * (0.55 + 0.55 * vfxHash(i + 3 + it.seed));
      const size = r * (0.045 + 0.065 * vfxHash(i + 11 + it.seed));
      const alpha = Math.max(0, (1 - k) * (0.75 - 0.3 * (dist / Math.max(r, 1))));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = vfxRgba(i % 3 === 0 ? pal[0] : (i % 3 === 1 ? pal[1] : pal[2]), 0.95);
      ctx.save();
      ctx.translate(Math.cos(a) * dist, Math.sin(a) * dist);
      if (style === 'ice' || style === 'arcane' || style === 'thunder') {
        ctx.rotate(a + it.t * (style === 'ice' ? 6 : 9));
        ctx.beginPath();
        ctx.moveTo(size * 2.4, 0);
        ctx.lineTo(0, -size);
        ctx.lineTo(-size * 1.2, 0);
        ctx.lineTo(0, size);
        ctx.closePath();
        ctx.fill();
      } else if (style === 'blood') {
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.7, size * 1.8, a, 0, TAU);
        ctx.fill();
      } else if (style === 'poison' || style === 'nature') {
        ctx.beginPath();
        ctx.arc(0, Math.sin(it.t * 12 + i) * size * 1.2, size * (1 + 0.3 * vfxHash(i)), 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, size * (1 + 0.4 * Math.sin(it.t * 18 + i)), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // 冰系: 边缘炸出的冰刺, 让冰爆有明确的「冰」形态
    if (style === 'ice') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + it.seed;
        const d = r * (0.32 + 0.55 * e);
        const spike = r * 0.17 * (0.7 + 0.5 * vfxHash(i + it.seed));
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d * 0.9);
        ctx.rotate(a + Math.PI / 2);
        ctx.globalAlpha = (1 - k) * 0.75;
        ctx.fillStyle = vfxRgba(i % 2 ? pal[0] : pal[1], 0.9);
        ctx.beginPath();
        ctx.moveTo(0, -spike);
        ctx.lineTo(spike * 0.34, spike * 0.34);
        ctx.lineTo(-spike * 0.34, spike * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 火焰: 向外甩出的火舌(水滴形), 和冰刺/符文形成三种不同的形状语言
    if (style === 'fire' || style === 'pyro' || style === 'dragon') {
      const n = this.count(10);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + it.seed * 1.3;
        const d = r * (0.18 + 0.62 * e) * (0.8 + 0.4 * vfxHash(i + 5 + it.seed));
        const len = r * 0.26 * (0.6 + 0.6 * vfxHash(i + 9 + it.seed)) * (1 - k * 0.4);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d - it.t * r * 0.2);
        ctx.rotate(a + Math.PI / 2);
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.fillStyle = vfxRgba(i % 2 ? pal[0] : pal[1], 0.9);
        ctx.beginPath();
        ctx.moveTo(0, -len);
        ctx.quadraticCurveTo(len * 0.45, -len * 0.15, 0, len * 0.5);
        ctx.quadraticCurveTo(-len * 0.45, -len * 0.15, 0, -len);
        ctx.fill();
        ctx.restore();
      }
    }

    // 奥术: 一圈往外推的符文刻度, 让「能量力场」有形状而不是只有一团光
    if (style === 'arcane' || style === 'void') {
      const n = this.count(14);
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = pal[0];
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const a = i * TAU / n + it.seed + it.t * 0.8;
        const rr = r * (0.42 + 0.5 * e);
        const len = r * 0.07 * (0.7 + 0.6 * vfxHash(i + it.seed));
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.lineTo(Math.cos(a) * (rr + len), Math.sin(a) * (rr + len));
        ctx.stroke();
      }
    }

    // 火焰/龙息的上升烟团
    if (style === 'fire' || style === 'pyro' || style === 'dragon') {
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 6; i++) {
        const a = it.seed + i * TAU / 6;
        const dist = r * (0.2 + 0.5 * e);
        const px = Math.cos(a) * dist;
        const py = Math.sin(a) * dist - it.t * r * 0.55;
        const size = r * (0.12 + 0.1 * vfxHash(i + it.seed));
        ctx.globalAlpha = Math.max(0, (1 - k) * 0.26);
        ctx.fillStyle = pal[3];
        ctx.beginPath();
        ctx.arc(px, py, size * (0.7 + 0.5 * (1 - k)), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  /* 龙头: 不是「身后一只写实龙在喷火」, 而是火焰本身在锥体前段聚成一只 Q 版龙头。
     全部用 fire 调色板 + lighter 叠加绘制, 没有实体材质, 和锥体是同一团火。 */
  _dragonHead(ctx, it, r, pal, fade) {
    const s = r * 0.38;                        // 头的大小(偏大, Q 版比例)
    const cx = r * 0.62;                       // 位置: 锥体前段, 火头领着整条火舌往前走
    const appear = clamp(it.t / 0.10, 0, 1);
    const open = clamp((it.t - 0.05) / 0.20, 0, 1);  // 张口
    const alpha = fade * appear;
    if (s < 5 || alpha <= 0.01) return;

    ctx.save();
    ctx.translate(cx, 0);
    ctx.globalCompositeOperation = 'lighter';

    // 头部的整体光团, 让头「长在火里」而不是贴在上面
    ctx.globalAlpha = 1;
    vfxGlow(ctx, 0, 0, s * 1.25, pal[1], 0.45 * alpha);

    // 头骨: 圆润的水滴形火焰块(Q 版大脑袋 + 短吻)
    const skull = ctx.createRadialGradient(-s * 0.10, -s * 0.24, s * 0.06, 0, 0, s * 1.05);
    skull.addColorStop(0, vfxRgba('#fff8dd', 0.95 * alpha));
    skull.addColorStop(0.32, vfxRgba(pal[0], 0.88 * alpha));
    skull.addColorStop(0.70, vfxRgba(pal[1], 0.62 * alpha));
    skull.addColorStop(1, vfxRgba(pal[2], 0));
    ctx.fillStyle = skull;
    ctx.beginPath();
    ctx.moveTo(-s * 0.92, s * 0.08);
    ctx.bezierCurveTo(-s * 0.96, -s * 0.60, -s * 0.34, -s * 0.94, s * 0.12, -s * 0.78);
    ctx.bezierCurveTo(s * 0.60, -s * 0.64, s * 0.94, -s * 0.30, s * 0.90, -s * 0.04);
    ctx.lineTo(s * 0.28, s * 0.06);
    ctx.bezierCurveTo(-s * 0.10, s * 0.18, -s * 0.64, s * 0.30, -s * 0.92, s * 0.08);
    ctx.closePath();
    ctx.fill();

    // 下颚: 绕口角张开, 也是火焰(张开后火从缝里冲出去)
    ctx.save();
    ctx.translate(s * 0.28, s * 0.06);
    ctx.rotate(open * 0.55);
    ctx.translate(-s * 0.28, -s * 0.06);
    const jaw = ctx.createLinearGradient(0, 0, s * 0.3, s * 0.5);
    jaw.addColorStop(0, vfxRgba(pal[0], 0.85 * alpha));
    jaw.addColorStop(0.55, vfxRgba(pal[1], 0.6 * alpha));
    jaw.addColorStop(1, vfxRgba(pal[2], 0));
    ctx.fillStyle = jaw;
    ctx.beginPath();
    ctx.moveTo(s * 0.86, s * 0.04);
    ctx.bezierCurveTo(s * 0.68, s * 0.42, s * 0.06, s * 0.54, -s * 0.34, s * 0.34);
    ctx.bezierCurveTo(-s * 0.08, s * 0.16, s * 0.44, s * 0.00, s * 0.86, s * 0.04);
    ctx.closePath();
    ctx.fill();
    // 獠牙只留两颗小三角, 圆头圆脑的 Q 版不画排牙
    ctx.fillStyle = vfxRgba('#fff3c4', 0.85 * alpha);
    for (let i = 0; i < 2; i++) {
      const tx = s * (0.52 + i * 0.20);
      ctx.beginPath();
      ctx.moveTo(tx, s * 0.02);
      ctx.lineTo(tx + s * 0.09, s * 0.02);
      ctx.lineTo(tx + s * 0.04, -s * 0.10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 角/鬃: 三簇向后上方舔的火舌
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(it.t * 16 + i * 1.7 + it.seed) * 0.10;
      const len = s * (0.85 + 0.25 * vfxHash(i + it.seed));
      const a0 = -2.25 - i * 0.35 + sway;         // 朝后上方
      const bx = -s * (0.34 + i * 0.16);
      const by = -s * (0.46 + i * 0.10);
      ctx.globalAlpha = 1;
      ctx.fillStyle = vfxRgba(i === 0 ? pal[0] : pal[1], 0.62 * alpha);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        bx + Math.cos(a0) * len * 0.55 - s * 0.12, by + Math.sin(a0) * len * 0.55,
        bx + Math.cos(a0 + 0.28) * len, by + Math.sin(a0 + 0.28) * len);
      ctx.quadraticCurveTo(
        bx + Math.cos(a0 + 0.10) * len * 0.5 + s * 0.14, by + Math.sin(a0) * len * 0.42,
        bx, by);
      ctx.fill();
    }

    // 眼睛: Q 版的大圆亮眼(两个), 加一点高光
    for (let i = 0; i < 2; i++) {
      const ex = s * (0.14 + i * 0.42);
      const ey = -s * (0.36 - i * 0.04);
      vfxGlow(ctx, ex, ey, s * 0.20, '#fff3c4', 0.55 * alpha);
      ctx.globalAlpha = 1;
      ctx.fillStyle = vfxRgba('#fffbe8', 0.95 * alpha);
      ctx.beginPath();
      ctx.arc(ex, ey, s * 0.085, 0, TAU);
      ctx.fill();
      ctx.fillStyle = vfxRgba('#2a0f04', 0.9 * alpha);
      ctx.beginPath();
      ctx.arc(ex + s * 0.012, ey + s * 0.006, s * 0.040, 0, TAU);
      ctx.fill();
    }

    // 喉咙/嘴里的核心光: 火焰从这里往外喷
    ctx.globalAlpha = 1;
    vfxGlow(ctx, s * 0.72, s * (0.02 + 0.06 * open), s * (0.30 + 0.10 * open), pal[0], 0.75 * alpha);
    vfxGlow(ctx, s * 0.80, s * (0.02 + 0.05 * open), s * 0.16, '#fffbe8', 0.55 * alpha);

    // 从嘴里冲出去的短火舌, 把「喷」这个动作做实
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.20 + Math.sin(it.t * 24 + i * 2.4 + it.seed) * 0.05;
      const len = s * (0.55 + 0.15 * Math.sin(it.t * 19 + i + it.seed));
      const w = s * 0.13;
      const mx = s * (0.86 + 0.06 * open);
      ctx.fillStyle = vfxRgba(i === 1 ? '#fffbe8' : pal[0], 0.55 * alpha);
      ctx.beginPath();
      ctx.moveTo(mx, Math.sin(a) * w * 0.5);
      ctx.quadraticCurveTo(mx + len * 0.55, Math.sin(a - 0.35) * w,
        mx + len, Math.sin(a) * w * 0.25);
      ctx.quadraticCurveTo(mx + len * 0.55, Math.sin(a + 0.35) * w,
        mx, Math.sin(a) * w * 0.5);
      ctx.fill();
    }

    // 头顶跳动的火苗, 让头始终在「烧」
    for (let i = 0; i < 4; i++) {
      const hx = -s * 0.55 + i * s * 0.30;
      const hh = s * (0.30 + 0.16 * Math.sin(it.t * 21 + i * 2.2 + it.seed));
      ctx.globalAlpha = 1;
      ctx.fillStyle = vfxRgba(i % 2 ? pal[0] : '#ffe9a8', 0.55 * alpha);
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.07, -s * 0.66);
      ctx.quadraticCurveTo(hx, -s * 0.66 - hh, hx + s * 0.07, -s * 0.66);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  },

  /* 奥爆: 能量力场炸裂 —— 球体膨胀 + 六边形网格 + 符文环 + 空腔 + 碎片 */
  _pulse(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const e = vfxEase(k);
    const fade = 1 - k;
    const pal = vfxPal(it.style);
    const r = it.r;

    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.globalCompositeOperation = 'lighter';

    // 1) 开爆白光: 极短
    if (k < 0.14) {
      const flash = 1 - k / 0.14;
      vfxGlow(ctx, 0, 0, r * (0.35 + 0.5 * flash), '#ffffff', 0.7 * flash);
    }

    // 2) 球体: 边缘亮、中间透
    const core = r * (0.18 + 1.0 * e);
    const g = ctx.createRadialGradient(0, 0, core * 0.06, 0, 0, core);
    g.addColorStop(0, vfxRgba('#ffffff', 0.42 * fade));
    g.addColorStop(0.40, vfxRgba(pal[1], 0.26 * fade));
    g.addColorStop(0.86, vfxRgba(pal[2], 0.30 * fade));
    g.addColorStop(1, vfxRgba(pal[0], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, core, 0, TAU);
    ctx.fill();

    // 3) 六边形力场: 三层, 反向旋转
    ctx.lineWidth = 1.2;
    for (let ring = 1; ring <= 3; ring++) {
      const rr = core * (ring / 3.35);
      const sides = 6 + ring * 6;
      const dir = ring % 2 ? 1 : -1;
      ctx.globalAlpha = fade * (0.42 - ring * 0.07);
      ctx.strokeStyle = ring === 1 ? pal[0] : pal[1];
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * TAU + it.seed + it.t * 1.3 * dir;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.stroke();
    }

    // 4) 外环: 三道错相的冲击波
    for (let i = 0; i < 3; i++) {
      const u = clamp(k * 1.15 - i * 0.12, 0, 1);
      if (u <= 0) continue;
      const rr = r * (0.25 + 0.95 * vfxEase(u));
      ctx.globalAlpha = (1 - u) * 0.7;
      ctx.strokeStyle = i === 0 ? pal[0] : pal[2];
      ctx.lineWidth = (it.heavy ? 4 : 2.6) * (1 - u) + 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }

    // 5) 符文刻度: 贴在球壳上的短划
    const runes = this.count(18);
    for (let i = 0; i < runes; i++) {
      const a = (i / runes) * TAU - it.t * 0.9 + it.seed;
      const rr = core * 0.92;
      const len = core * (0.05 + 0.05 * vfxHash(i + it.seed));
      ctx.globalAlpha = fade * (0.25 + 0.4 * vfxHash(i + 3 + it.seed));
      ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : pal[0];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a) * (rr + len), Math.sin(a) * (rr + len));
      ctx.stroke();
    }

    // 6) 玻璃碎片: 向外飞散并旋转
    const parts = this.count(it.heavy ? 16 : 11);
    for (let i = 0; i < parts; i++) {
      const a = (i / parts) * TAU + it.seed + Math.sin(it.t * 5 + i) * 0.1;
      const dist = r * (0.2 + 1.0 * e) * (0.6 + 0.5 * vfxHash(i + 7 + it.seed));
      const size = r * (0.035 + 0.05 * vfxHash(i + 11 + it.seed)) * (1 - k * 0.3);
      ctx.globalAlpha = fade * 0.85;
      ctx.fillStyle = i % 3 === 0 ? pal[0] : pal[1];
      ctx.save();
      ctx.translate(Math.cos(a) * dist, Math.sin(a) * dist);
      ctx.rotate(a + it.t * 7);
      ctx.beginPath();
      ctx.moveTo(size * 2.2, 0);
      ctx.lineTo(-size * 0.5, -size);
      ctx.lineTo(-size * 1.1, 0);
      ctx.lineTo(-size * 0.5, size * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 7) 空腔: 内圈压暗 + 壳层亮环, 做出「力场是中空的」
    const hollow = ctx.createRadialGradient(0, 0, 0, 0, 0, core * 0.55);
    hollow.addColorStop(0, 'rgba(4,6,14,0.55)');
    hollow.addColorStop(1, 'rgba(4,6,14,0)');
    ctx.globalAlpha = fade;
    ctx.fillStyle = hollow;
    ctx.beginPath();
    ctx.arc(0, 0, core * 0.55, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = fade * 0.8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, core * 0.66, 0, TAU);
    ctx.stroke();

    ctx.restore();
  },

  _shock(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const e = vfxEase(k);
    const pal = vfxPal(it.style);
    const r = it.r * (0.15 + 0.95 * e);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.scale(1, 0.62);
    ctx.globalCompositeOperation = 'lighter';

    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = (it.heavy ? 5 : 3) * (1 - k) + 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = (1 - k) * 0.45;
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.18, 0, TAU);
    ctx.stroke();

    if (it.heavy) {
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.strokeStyle = pal[2];
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10 + it.seed;
        const r0 = r * 0.3;
        const r1 = r * (0.95 + 0.25 * vfxHash(i + it.seed));
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  _cast(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const fade = k < 0.18 ? k / 0.18 : (1 - (k - 0.18) / 0.82);
    const pal = vfxPal(it.style);
    const r = it.r * (0.7 + 0.3 * vfxEase(k));
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.scale(1, 0.58);
    ctx.rotate(it.t * 1.35 + it.seed);
    ctx.globalCompositeOperation = 'lighter';

    ctx.globalAlpha = Math.max(0, fade) * 0.7;
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();

    ctx.globalAlpha = Math.max(0, fade) * 0.45;
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, TAU);
    ctx.stroke();

    // 符文刻度
    ctx.globalAlpha = Math.max(0, fade) * 0.8;
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10;
      const r0 = r * 0.82;
      const r1 = r * (i % 2 === 0 ? 1.08 : 1.16);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }

    // 汇聚粒子
    ctx.fillStyle = vfxRgba(pal[0], 0.9);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + it.t * 2.4 + it.seed;
      const rr = r * (1.3 - 0.75 * vfxEase(k)) * (0.7 + 0.3 * vfxHash(i + it.seed));
      ctx.globalAlpha = Math.max(0, fade) * 0.75;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },

  _aura(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const pal = vfxPal(it.style);
    const rise = vfxEase(k);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.globalCompositeOperation = 'lighter';

    // 脚底光环
    ctx.save();
    ctx.scale(1, 0.55);
    ctx.globalAlpha = (1 - k) * 0.75;
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, it.r * (0.7 + 0.35 * rise), 0, TAU);
    ctx.stroke();
    ctx.restore();

    // 上升光柱
    const g = ctx.createLinearGradient(0, 0, 0, -it.r * 2.4);
    g.addColorStop(0, vfxRgba(pal[1], 0.28 * (1 - k)));
    g.addColorStop(0.55, vfxRgba(pal[0], 0.20 * (1 - k)));
    g.addColorStop(1, vfxRgba(pal[1], 0));
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(0, -it.r * 1.2, it.r * 0.8, it.r * 1.2, 0, 0, TAU);
    ctx.fill();

    // 上升粒子
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 + it.seed;
      const rr = it.r * (0.35 + 0.55 * vfxHash(i + it.seed));
      const yy = -((rise * 1.6 + vfxHash(i + 5 + it.seed)) % 1) * it.r * 2.2;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.fillStyle = vfxRgba(pal[0], 0.9);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, yy, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },

  _lightning(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const pal = vfxPal(it.style);
    const segs = 9;
    const dx = it.x2 - it.x1;
    const dy = it.y2 - it.y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const amp = Math.min(30, len * 0.11);
    const flick = 0.55 + 0.45 * Math.sin(it.t * 80 + it.seed);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const passes = [
      { color: vfxRgba(pal[2], 0.35), w: 9 },
      { color: vfxRgba(pal[1], 0.7), w: 4.5 },
      { color: vfxRgba(pal[0], 1), w: 1.6 }
    ];
    for (let p = 0; p < passes.length; p++) {
      ctx.globalAlpha = (1 - k) * flick * (p === 2 ? 1 : 0.8);
      ctx.strokeStyle = passes[p].color;
      ctx.lineWidth = passes[p].w;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const bend = (vfxHash(i + it.seed) - 0.5) * 2 * amp * Math.sin(u * Math.PI);
        const px = it.x1 + dx * u + nx * bend;
        const py = it.y1 + dy * u + ny * bend;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 分叉
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.strokeStyle = vfxRgba(pal[1], 0.8);
    ctx.lineWidth = 2;
    for (let b = 0; b < 2; b++) {
      const u = 0.3 + b * 0.28;
      const bx = it.x1 + dx * u;
      const by = it.y1 + dy * u;
      const ba = Math.atan2(dy, dx) + (b === 0 ? 0.7 : -0.7);
      const bl = len * (0.12 + 0.1 * vfxHash(b + it.seed));
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl);
      ctx.stroke();
    }
    ctx.restore();
  },

  _impact(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const pal = vfxPal(it.style);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - k) * 0.9;
    vfxGlow(ctx, 0, 0, 16 * (1 - k) + 6, pal[0], 0.8);
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + it.seed;
      const r0 = 3 + 8 * k;
      const r1 = 10 + 16 * k;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  },

  /* 裂地贴花: 中心塌陷 + 放射裂纹(带分叉), 随寿命淡出 */
  _crack(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const fade = k < 0.10 ? k / 0.10 : (1 - (k - 0.10) / 0.90);
    const pal = vfxPal(it.style);
    const grow = 0.35 + 0.65 * vfxEase(Math.min(1, k * 2.6));
    const r = it.r * grow;

    ctx.save();
    ctx.translate(it.x, it.y);

    // 中心塌陷
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.72);
    g.addColorStop(0, 'rgba(5,3,2,' + (0.6 * fade).toFixed(3) + ')');
    g.addColorStop(0.65, 'rgba(8,5,3,' + (0.3 * fade).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(8,5,3,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, TAU);
    ctx.fill();

    const mains = 9;
    for (let i = 0; i < mains; i++) {
      const a = (i / mains) * TAU + (vfxHash(i + it.seed) - 0.5) * 0.22;
      const len = r * (0.5 + 0.5 * vfxHash(i + 3 + it.seed));
      const segs = 5;
      const xs = [0], ys = [0];
      for (let j = 1; j <= segs; j++) {
        const u = j / segs;
        const aa = a + (vfxHash(i * 7 + j + it.seed) - 0.5) * 0.16;
        xs.push(Math.cos(aa) * len * u);
        ys.push(Math.sin(aa) * len * u);
      }
      // 暗缝
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 3.4 * (1 - grow * 0.25);
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (let j = 1; j < xs.length; j++) ctx.lineTo(xs[j], ys[j]);
      ctx.stroke();
      // 发光边
      ctx.globalAlpha = fade * 0.55;
      ctx.strokeStyle = i % 3 === 0 ? pal[0] : pal[2];
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // 分叉
      const bi = 2 + (i % 3);
      const ba = a + (i % 2 ? 1 : -1) * (0.5 + vfxHash(i + 11 + it.seed) * 0.4);
      ctx.globalAlpha = fade * 0.5;
      ctx.beginPath();
      ctx.moveTo(xs[bi], ys[bi]);
      ctx.lineTo(xs[bi] + Math.cos(ba) * len * 0.32, ys[bi] + Math.sin(ba) * len * 0.32);
      ctx.stroke();
    }
    ctx.restore();
  },

  /* 碎石: 解析式抛物线, 不保存粒子状态 */
  _debris(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const fade = 1 - k;
    const pal = vfxPal(it.style);
    ctx.save();
    for (let i = 0; i < it.n; i++) {
      const a = vfxHash(i + it.seed) * TAU;
      const spd = it.r * (0.9 + 1.8 * vfxHash(i + 3 + it.seed));
      const t = it.t;
      const px = it.x + Math.cos(a) * spd * t;
      const py = it.y + Math.sin(a) * spd * t * 0.6 + 300 * t * t;
      const sz = it.r * (0.025 + 0.055 * vfxHash(i + 7 + it.seed)) * (1 - k * 0.35);
      if (sz <= 0.4) continue;
      ctx.globalAlpha = fade * 0.95;
      ctx.fillStyle = i % 5 === 0 ? pal[1] : '#2b2119';
      const rot = a + t * 6 * (i % 2 ? 1 : -1);
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(rot) * sz, py + Math.sin(rot) * sz);
      ctx.lineTo(px + Math.cos(rot + 2.4) * sz, py + Math.sin(rot + 2.4) * sz);
      ctx.lineTo(px + Math.cos(rot + 4.2) * sz * 1.1, py + Math.sin(rot + 4.2) * sz * 1.1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  /* 旋风: 地面风环 + 螺旋气流 + 环绕刀光 + 内吸碎屑 */
  _whirl(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const fade = k < 0.15 ? k / 0.15 : (1 - (k - 0.15) / 0.85);
    const pal = vfxPal(it.style);
    const r = it.r * (0.75 + 0.25 * vfxEase(k));
    const spin = it.t * 16 + it.seed;

    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.globalCompositeOperation = 'lighter';

    // 地面风环
    ctx.globalAlpha = fade * 0.5;
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05, r * 0.42, 0, 0, TAU);
    ctx.stroke();

    // 螺旋气流
    for (let arm = 0; arm < 3; arm++) {
      ctx.globalAlpha = fade * (0.5 - arm * 0.1);
      ctx.strokeStyle = arm === 0 ? pal[0] : pal[1];
      ctx.lineWidth = 3.2 - arm * 0.6;
      ctx.beginPath();
      for (let j = 0; j <= 14; j++) {
        const u = j / 14;
        const a = spin + arm * (TAU / 3) + u * 2.4;
        const rr = r * (0.35 + 0.7 * u);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr * 0.42 - u * r * 0.85;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 环绕刀光
    ctx.globalAlpha = fade * 0.7;
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = 2.6;
    for (let b = 0; b < 2; b++) {
      const a0 = spin * 0.9 + b * Math.PI;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.18, r * 0.85, r * 0.36, 0, a0, a0 + 1.5);
      ctx.stroke();
    }

    // 内吸碎屑
    for (let i = 0; i < this.count(12); i++) {
      const ph = (k + i / 12) % 1;
      const a = spin * 1.4 + i * (TAU / 12);
      const rr = r * (1.05 - ph * 0.85);
      ctx.globalAlpha = fade * 0.55 * (1 - ph);
      ctx.fillStyle = i % 3 === 0 ? pal[0] : pal[1];
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.5 - ph * r * 0.5, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },

  _dust(ctx, it) {
    const k = clamp(it.t / it.life, 0, 1);
    const e = vfxEase(k);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 4; i++) {
      const a = it.seed + i * TAU / 4;
      const dist = 4 + e * 22;
      ctx.globalAlpha = (1 - k) * 0.28;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * dist, Math.sin(a) * dist * 0.6 - e * 6,
        9 + e * 8, 5 + e * 4, a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },

  /* =========================================================
     玩家施法 / 引导演出
     ========================================================= */
  drawPlayerCast(ctx, p, g) {
    const atk = p.attack;
    const ch = p.channel;
    if (!atk && !ch) return;
    const style = (ch && ch.style) || (atk && atk.style) || 'arcane';
    const pal = vfxPal(style);
    const def = atk ? CONTENT.skills[atk.id] : (ch ? CONTENT.skills[ch.id] : null);
    const color = (ch && ch.color) || (def && def.color) || pal[1];
    const time = g ? g.time : 0;
    const face = p.facing || 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (atk && (atk.kind === 'cast' || atk.kind === 'buff' || atk.kind === 'slam')) {
      const u = clamp(atk.t / atk.dur, 0, 1);
      const fade = u < 0.2 ? u / 0.2 : Math.max(0, 1 - (u - 0.2) / 0.8);
      // 脚下法阵
      ctx.save();
      ctx.translate(p.x, p.y + p.r * 0.55);
      ctx.scale(1, 0.52);
      ctx.rotate(time * 1.8 + p.walk * 0.2);
      ctx.globalAlpha = fade * 0.75;
      ctx.strokeStyle = pal[1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 1.7, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = fade * 0.45;
      ctx.strokeStyle = pal[0];
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 1.25, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = fade * 0.7;
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * p.r * 1.4, Math.sin(a) * p.r * 1.4);
        ctx.lineTo(Math.cos(a) * p.r * 1.7, Math.sin(a) * p.r * 1.7);
        ctx.stroke();
      }
      ctx.restore();

      // 手心光球
      const pulse = 4.5 + Math.sin(time * 22) * 1.4 + fade * 3;
      const hx = p.x + face * (p.r * 1.25);
      const hy = p.y - p.r * 0.15;
      ctx.globalAlpha = fade * 0.9;
      vfxGlow(ctx, hx, hy, pulse * 2.7, pal[1], 0.9);
      ctx.fillStyle = vfxRgba(pal[0], 0.95);
      ctx.beginPath();
      ctx.arc(hx, hy, pulse * 0.55, 0, TAU);
      ctx.fill();
    }

    if (ch) {
      // 剑刃风暴: 龙卷风 + 环绕刀光 + 内吸碎屑
      const radius = (ch.radius || p.r * 2.4);
      const spin = time * 9 + p.walk;

      // 地面风环
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(time * 8);
      ctx.strokeStyle = pal[1];
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius * 1.02, radius * 0.42, 0, 0, TAU);
      ctx.stroke();

      // 螺旋气流: 三股上升气流, 让旋风有"竖起来"的体积
      for (let arm = 0; arm < 3; arm++) {
        ctx.globalAlpha = 0.34 - arm * 0.07;
        ctx.strokeStyle = arm === 0 ? pal[0] : pal[1];
        ctx.lineWidth = 3 - arm * 0.5;
        ctx.beginPath();
        for (let j = 0; j <= 14; j++) {
          const u = j / 14;
          const a = spin + arm * (TAU / 3) + u * 2.2;
          const rr = radius * (0.3 + 0.72 * u);
          const x = p.x + Math.cos(a) * rr;
          const y = p.y + Math.sin(a) * rr * 0.42 - u * radius * 0.8;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 环绕刀光: 每一道都是「外缘宽 + 内缘细」的双线
      for (let blade = 0; blade < 3; blade++) {
        const a0 = spin + blade * TAU / 3;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = pal[1];
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, a0, a0 + 0.95);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = pal[0];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 1.02, a0 + 0.35, a0 + 0.95);
        ctx.stroke();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = pal[0];
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 0.72, a0 + 0.2, a0 + 1.1);
        ctx.stroke();
      }

      // 内吸碎屑: 从外圈螺旋收向脚底
      for (let i = 0; i < 14; i++) {
        const ph = (time * 0.6 + i / 14) % 1;
        const a = spin * 1.4 + i * (TAU / 14);
        const rr = radius * (1.05 - ph * 0.9);
        ctx.globalAlpha = 0.5 * (1 - ph);
        ctx.fillStyle = i % 3 === 0 ? pal[0] : pal[1];
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * rr,
          p.y + Math.sin(a) * rr * 0.5 - ph * radius * 0.55, 1.8, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  /* =========================================================
     地面区域: 暴风雪 / 烈焰风暴 / 毒云 / 陨石
     ========================================================= */
  drawZone(ctx, z) {
    if (!z || z.dead) return;
    const art = z.art || '';
    if (art === 'blizzard') return this._zoneBlizzard(ctx, z);
    if (art === 'flamestrike') return this._zoneFlame(ctx, z);
    if (art === 'boss_poison') return this._zonePoison(ctx, z);
    if (art === 'boss_meteor') return this._zoneMeteor(ctx, z);
    return this._zoneGeneric(ctx, z);
  },

  _zoneBlizzard(ctx, z) {
    const dur = Math.max(z.duration, 0.01);
    const k = clamp(z.t / dur, 0, 1);
    const fade = z.t < 0.22 ? z.t / 0.22 : (k > 0.84 ? (1 - k) / 0.16 : 1);
    const r = z.r;
    const t = z.t;

    ctx.save();
    ctx.translate(z.x, z.y);

    // 冰面
    const g = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r);
    g.addColorStop(0, 'rgba(180,245,255,0.42)');
    g.addColorStop(0.55, 'rgba(95,185,255,0.27)');
    g.addColorStop(1, 'rgba(30,80,170,0.03)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // 冷雾: 把暖色地面整体压成冰蓝色
    ctx.globalAlpha = fade * 0.5;
    vfxSoft(ctx, 0, 0, r * 1.02, r * 0.82, '#bfe9ff', 0.32);

    // 冰霜裂纹
    ctx.globalAlpha = fade * 0.72;
    ctx.strokeStyle = 'rgba(225,250,255,0.95)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const a = vfxHash(i + z.seed) * TAU;
      const len = r * (0.3 + 0.62 * vfxHash(i + 7 + z.seed));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.08, Math.sin(a) * r * 0.08);
      ctx.lineTo(Math.cos(a + 0.12) * len * 0.55, Math.sin(a + 0.12) * len * 0.55);
      ctx.lineTo(Math.cos(a - 0.06) * len, Math.sin(a - 0.06) * len);
      ctx.stroke();
    }

    // 旋转风暴臂
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * 0.62;
    ctx.strokeStyle = 'rgba(205,245,255,0.95)';
    ctx.lineWidth = 3;
    for (let arm = 0; arm < 4; arm++) {
      const base = t * 1.25 + arm * TAU / 4 + z.seed;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const a = base + u * 1.9;
        const rr = r * (0.12 + 0.86 * u);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr * 0.9;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 落雪: 用椭圆范围 + 循环下落, 不分配对象
    ctx.globalAlpha = fade * 0.95;
    ctx.strokeStyle = 'rgba(240,252,255,0.95)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 62; i++) {
      const h1 = vfxHash(i + 3 + z.seed);
      const h2 = vfxHash(i + 19 + z.seed);
      const ang = h1 * TAU + t * 0.18;
      const rad = r * Math.sqrt(h2) * 0.96;
      const fall = ((t * 0.55 + h1) % 1);
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad * 0.78 + (fall * 2 - 1) * r * 0.55;
      ctx.globalAlpha = fade * (0.3 + 0.7 * (1 - fall));
      ctx.beginPath();
      ctx.moveTo(px - 1.2, py - 6);
      ctx.lineTo(px + 1.8, py + 1.5);
      ctx.stroke();
    }

    // 雪花星
    ctx.fillStyle = 'rgba(245,253,255,0.98)';
    for (let i = 0; i < 18; i++) {
      const a = vfxHash(i + 5 + z.seed) * TAU + t * 0.3;
      const rr = r * (0.15 + 0.78 * vfxHash(i + 13 + z.seed));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * 0.8;
      const size = 2.5 + 3.5 * vfxHash(i + 31 + z.seed);
      ctx.globalAlpha = fade * (0.45 + 0.45 * Math.sin(t * 4 + i));
      ctx.beginPath();
      for (let s = 0; s < 3; s++) {
        const sa = s * Math.PI / 3 + t * 0.8;
        ctx.moveTo(px - Math.cos(sa) * size, py - Math.sin(sa) * size);
        ctx.lineTo(px + Math.cos(sa) * size, py + Math.sin(sa) * size);
      }
      ctx.strokeStyle = 'rgba(240,252,255,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 边缘寒霜环
    ctx.globalAlpha = fade * (0.65 + 0.15 * Math.sin(t * 5));
    ctx.strokeStyle = 'rgba(170,235,255,0.95)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(150,225,255,0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.98 + 0.02 * Math.sin(t * 4)), 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();
  },

  _zoneFlame(ctx, z) {
    const delay = Math.max(z.delay || 0.35, 0.01);
    const k = clamp(z.t / delay, 0, 1);
    const r = z.r;
    const pal = vfxPal('fire');

    ctx.save();
    ctx.translate(z.x, z.y);

    // 预警圈
    ctx.globalAlpha = 0.35 + 0.35 * k;
    ctx.strokeStyle = vfxRgba(pal[1], 0.95);
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, vfxRgba(pal[1], 0.18 + 0.25 * k));
    g.addColorStop(0.7, vfxRgba(pal[2], 0.10 + 0.16 * k));
    g.addColorStop(1, vfxRgba(pal[2], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // 内部旋转符文
    ctx.save();
    ctx.scale(1, 0.55);
    ctx.rotate(z.t * 2.2 + z.seed);
    ctx.globalAlpha = 0.45 + 0.35 * k;
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a0 = i * TAU / 6;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.68, a0, a0 + 0.45);
      ctx.stroke();
    }
    ctx.restore();

    // 地面裂纹
    ctx.globalAlpha = 0.25 + 0.35 * k;
    ctx.strokeStyle = vfxRgba(pal[1], 0.8);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = vfxHash(i + z.seed) * TAU;
      const r0 = r * 0.12;
      const r1 = r * (0.35 + 0.55 * vfxHash(i + 9 + z.seed));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a + 0.15) * r1 * 0.7, Math.sin(a + 0.15) * r1 * 0.7);
      ctx.lineTo(Math.cos(a - 0.08) * r1, Math.sin(a - 0.08) * r1);
      ctx.stroke();
    }

    // 将爆未爆的闪光
    if (k > 0.72) {
      const f = (k - 0.72) / 0.28;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = f * 0.35;
      vfxGlow(ctx, 0, 0, r * (0.4 + 0.7 * f), pal[1], 0.9);
    }
    ctx.restore();
  },

  _zonePoison(ctx, z) {
    const k = clamp(z.t / Math.max(z.duration || 6, 0.01), 0, 1);
    const fade = z.t < 0.3 ? z.t / 0.3 : (k > 0.85 ? (1 - k) / 0.15 : 1);
    const r = z.r;
    const t = z.t;
    const pal = vfxPal('poison');

    ctx.save();
    ctx.translate(z.x, z.y);

    ctx.globalAlpha = fade * 0.72;
    vfxSoft(ctx, 0, 0, r * 1.05, r * 0.82, pal[2], 0.72);
    const pg = ctx.createRadialGradient(0, 0, r * 0.06, 0, 0, r);
    pg.addColorStop(0, 'rgba(120,230,140,0.34)');
    pg.addColorStop(0.6, 'rgba(60,160,80,0.20)');
    pg.addColorStop(1, 'rgba(20,80,40,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // 翻滚毒雾
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + t * 0.35 + z.seed;
      const dist = r * (0.18 + 0.42 * vfxHash(i + z.seed));
      const px = Math.cos(a) * dist;
      const py = Math.sin(a) * dist * 0.7 + Math.sin(t * 1.7 + i) * 4;
      const rr = r * (0.2 + 0.2 * vfxHash(i + 7 + z.seed));
      ctx.globalAlpha = fade * 0.28;
      vfxGlow(ctx, px, py, rr * 1.9, pal[1], 0.85);
    }

    // 气泡
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = vfxRgba(pal[0], 0.9);
    for (let i = 0; i < 20; i++) {
      const h = vfxHash(i + 11 + z.seed);
      const a = vfxHash(i + 3 + z.seed) * TAU;
      const rr = r * Math.sqrt(h) * 0.92;
      const rise = ((t * 0.35 + h) % 1);
      ctx.globalAlpha = fade * (1 - rise) * 0.8;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.7 - rise * r * 0.7,
        1.8 + 3 * vfxHash(i + 21 + z.seed), 0, TAU);
      ctx.fill();
    }

    // 边缘
    ctx.globalAlpha = fade * 0.7;
    ctx.strokeStyle = vfxRgba(pal[1], 0.9);
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(90,220,120,0.7)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.96 + 0.025 * Math.sin(t * 3.5)), 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  },

  _zoneMeteor(ctx, z) {
    const delay = Math.max(z.delay || 0.85, 0.01);
    const k = clamp(z.t / delay, 0, 1);
    const e = k * k;
    const r = z.r;
    const pal = vfxPal('fire');

    ctx.save();
    ctx.translate(z.x, z.y);

    // 地面警告圈
    ctx.globalAlpha = 0.42 + 0.4 * k;
    ctx.strokeStyle = vfxRgba(pal[1], 0.9);
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    const g = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r);
    g.addColorStop(0, vfxRgba(pal[1], 0.18 + 0.24 * k));
    g.addColorStop(1, vfxRgba(pal[2], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // 落点阴影
    ctx.globalAlpha = 0.25 + 0.4 * k;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (0.2 + 0.6 * e), r * (0.1 + 0.25 * e), 0, 0, TAU);
    ctx.fill();

    // 下落的陨石
    const startY = -r * 8.5;
    const yy = startY * (1 - e);
    const scale = 0.55 + 0.55 * k;
    ctx.globalCompositeOperation = 'lighter';
    // 尾焰
    for (let i = 1; i <= 9; i++) {
      const ty = yy - i * 12 * scale;
      ctx.globalAlpha = (1 - k * 0.3) * (0.32 - i * 0.028);
      vfxGlow(ctx, Math.sin(i * 1.7) * 2, ty, r * (0.32 + i * 0.03), pal[1], 0.9);
    }
    // 主体
    ctx.globalAlpha = 0.95;
    vfxGlow(ctx, 0, yy, r * 1.35 * scale, pal[1], 0.9);
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    ctx.arc(0, yy, r * 0.38 * scale, 0, TAU);
    ctx.fill();
    ctx.fillStyle = vfxRgba(pal[2], 0.9);
    ctx.beginPath();
    ctx.arc(0, yy, r * 0.5 * scale, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    ctx.arc(0, yy, r * 0.22 * scale, 0, TAU);
    ctx.fill();
    ctx.restore();
  },

  _zoneGeneric(ctx, z) {
    const k = z.kind === 'field'
      ? clamp(z.t / Math.max(z.duration, 0.01), 0, 1)
      : clamp(z.t / Math.max(z.delay, 0.01), 0, 1);
    const pal = vfxPal(z.hostile ? 'void' : 'bolt');
    const color = z.color || pal[1];
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.globalAlpha = z.kind === 'field' ? 0.16 + 0.05 * Math.sin(z.t * 8) : 0.12 + 0.18 * k;
    const g = ctx.createRadialGradient(0, 0, z.r * 0.12, 0, 0, z.r);
    g.addColorStop(0, vfxRgba(color, 0.55));
    g.addColorStop(1, vfxRgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, z.r, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.35 + 0.4 * k;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, z.r * (z.kind === 'burst' ? 0.4 + 0.6 * k : 1), 0, TAU);
    ctx.stroke();

    if (z.hostile) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#ff5c7a';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, z.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  },

  /* =========================================================
     飞行弹体
     ========================================================= */
  drawProjectile(ctx, pr) {
    const style = pr.style || (pr.hostile ? 'shadow' : (pr.type === 'fireball' ? 'fire' : 'bolt'));
    const pal = vfxPal(style);
    const r = pr.r;
    const t = pr.age || 0;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 地面光晕
    if (!pr.hostile) {
      ctx.globalAlpha = 0.22;
      vfxGlow(ctx, pr.x, pr.y, r * 5.5, pal[1], 0.7);
    }

    // 拖尾
    const tr = pr.trail;
    if (tr && tr.length > 1) {
      const n = tr.length;
      ctx.lineCap = 'round';
      for (let pass = 0; pass < (pr.hostile ? 1 : 2); pass++) {
        ctx.strokeStyle = pass === 0 ? vfxRgba(pal[2], 0.55) : vfxRgba(pal[1], 0.5);
        ctx.lineWidth = pass === 0 ? r * 1.25 : r * 0.55;
        ctx.globalAlpha = pass === 0 ? 0.35 : 0.5;
        ctx.beginPath();
        ctx.moveTo(tr[0].x, tr[0].y);
        for (let j = 1; j < n; j++) ctx.lineTo(tr[j].x, tr[j].y);
        ctx.lineTo(pr.x, pr.y);
        ctx.stroke();
      }
    }

    if (pr.hostile) {
      // 敌方弹: 暗核 + 彩色边缘 + 尾焰, 保持轻量
      ctx.globalAlpha = 0.35;
      vfxGlow(ctx, pr.x, pr.y, r * 3.2, pal[1], 0.9);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal[2];
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, r * 1.18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal[1];
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, r * 0.78, 0, TAU);
      ctx.fill();
      ctx.fillStyle = vfxRgba(pal[3], 0.9);
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }

    switch (style) {
      case 'fire':
      case 'pyro': {
        const big = style === 'pyro' ? 1.35 : 1;
        // 外焰
        ctx.globalAlpha = 0.55;
        vfxGlow(ctx, pr.x, pr.y, r * (4.2 * big), pal[1], 0.85);
        // 旋转火舌
        for (let i = 0; i < 6; i++) {
          const a = t * 9 + i * TAU / 6 + (pr.spin || 0);
          const px = pr.x + Math.cos(a) * r * 0.55;
          const py = pr.y + Math.sin(a) * r * 0.55;
          ctx.globalAlpha = 0.65;
          ctx.fillStyle = i % 2 ? pal[1] : pal[2];
          ctx.beginPath();
          ctx.arc(px, py, r * (0.52 + 0.18 * Math.sin(t * 16 + i)), 0, TAU);
          ctx.fill();
        }
        // 核心
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = pal[0];
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 0.72 * big, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 0.3 * big, 0, TAU);
        ctx.fill();
        // 火星
        for (let i = 0; i < 5; i++) {
          const a = t * 6 + i * 2.1;
          const dist = r * (1.5 + 1.1 * vfxHash(i + 3));
          ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 20 + i);
          ctx.fillStyle = pal[1];
          ctx.beginPath();
          ctx.arc(pr.x - Math.cos(a) * dist, pr.y - Math.sin(a) * dist, 1.6, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'ice': {
        const a = Math.atan2(pr.vy, pr.vx);
        ctx.globalAlpha = 0.5;
        vfxGlow(ctx, pr.x, pr.y, r * 4.5, pal[1], 0.8);
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(a);
        ctx.globalAlpha = 0.92;
        const ig = ctx.createLinearGradient(-r * 1.8, 0, r * 2.2, 0);
        ig.addColorStop(0, vfxRgba(pal[2], 0.1));
        ig.addColorStop(0.55, vfxRgba(pal[1], 0.85));
        ig.addColorStop(1, pal[0]);
        ctx.fillStyle = ig;
        ctx.beginPath();
        ctx.moveTo(r * 2.5, 0);
        ctx.lineTo(0, -r * 0.82);
        ctx.lineTo(-r * 1.65, 0);
        ctx.lineTo(0, r * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = pal[0];
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-r * 1.2, 0);
        ctx.lineTo(r * 1.8, 0);
        ctx.stroke();
        ctx.restore();
        // 雪花碎晶
        for (let i = 0; i < 4; i++) {
          const aa = t * 5 + i * 1.7;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = pal[0];
          ctx.beginPath();
          ctx.arc(pr.x + Math.cos(aa) * r * 2.2, pr.y + Math.sin(aa) * r * 1.4, 1.4, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'arcane': {
        ctx.globalAlpha = 0.55;
        vfxGlow(ctx, pr.x, pr.y, r * 4.8, pal[1], 0.9);
        // 旋转符文环
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(t * 7 + (pr.spin || 0));
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = pal[1];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.9, r * 0.8, 0, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.4, r * 1.7, 0.5, 0, TAU);
        ctx.stroke();
        // 环绕光点
        for (let i = 0; i < 3; i++) {
          const a = t * 8 + i * TAU / 3;
          ctx.fillStyle = pal[0];
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 1.8, Math.sin(a) * r * 1.8, 2, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        // 核心
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal[0];
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 0.72, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal[2];
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 0.36, 0, TAU);
        ctx.fill();
        break;
      }
      case 'dragon': {
        ctx.globalAlpha = 0.6;
        vfxGlow(ctx, pr.x, pr.y, r * 5, pal[1], 0.9);
        const a = Math.atan2(pr.vy, pr.vx);
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(a);
        for (let i = 0; i < 5; i++) {
          const u = i / 5;
          ctx.globalAlpha = 0.55 - u * 0.12;
          ctx.fillStyle = i % 2 ? pal[1] : pal[2];
          ctx.beginPath();
          ctx.ellipse(-r * (0.4 + u * 1.9), Math.sin(t * 14 + i) * r * 0.3,
            r * (0.62 - u * 0.08), r * (0.42 - u * 0.05), 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal[0];
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 0.7, 0, TAU);
        ctx.fill();
        break;
      }
      default: {
        ctx.globalAlpha = 0.45;
        vfxGlow(ctx, pr.x, pr.y, r * 3.6, pal[1], 0.9);
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal[2];
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 1.05, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal[1];
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 0.72, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal[0];
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 0.3, 0, TAU);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
};
