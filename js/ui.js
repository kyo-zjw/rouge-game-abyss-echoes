/* =========================================================
   深渊回响 — 渲染: 世界 / 背景 / HUD / 标题 / 职业与形象选择 / 升级 / 结算
   ========================================================= */

'use strict';

const FONT = '"Segoe UI", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const font = (size, weight) => (weight || 600) + ' ' + size + 'px ' + FONT;

const C = {
  bg: '#05060a',
  ink: '#e8f0ff',
  dim: 'rgba(200,220,255,0.55)',
  faint: 'rgba(160,190,255,0.18)',
  accent: '#63e6ff',
  gold: '#ffd166',
  danger: '#ff6b8b',
  shield: '#8ecbff',
  panel: 'rgba(9,13,22,0.86)'
};

function wrapText(ctx, text, maxWidth) {
  const out = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') { out.push(line); line = ''; continue; }
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = ch; }
    else line = test;
  }
  if (line) out.push(line);
  return out;
}

function fmtGold(n) {
  return (Math.floor(Number(n) || 0)).toLocaleString();
}

function lastPlayedText(ms) {
  if (!ms) return '尚未游玩';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return '今天玩过';
  if (days === 1) return '昨天玩过';
  return days + ' 天前';
}

/* 技能数值字段 -> 展示标签 / 格式化, 用于三选一悬停对比 */
const SKILL_FIELDS = {
  dmg: ['伤害', v => Math.round(v)],
  cd: ['冷却', v => (Math.round(v * 100) / 100) + 's'],
  range: ['射程', v => Math.round(v)],
  radius: ['半径', v => Math.round(v)],
  aoe: ['爆炸半径', v => Math.round(v)],
  castRange: ['施法距离', v => Math.round(v)],
  count: ['弹数', v => v],
  volleys: ['轮次', v => v],
  chains: ['连锁', v => v],
  shield: ['护盾', v => Math.round(v)],
  duration: ['持续', v => v.toFixed(1) + 's'],
  slow: ['减速', v => Math.round(v * 100) + '%'],
  slowT: ['减速时长', v => v.toFixed(1) + 's'],
  dmgMul: ['增伤', v => '+' + Math.round(v * 100) + '%'],
  healPct: ['回复', v => Math.round(v * 100) + '%'],
  knock: ['击退', v => Math.round(v)],
  vuln: ['易伤', v => Math.round(v * 100) + '%'],
  distance: ['距离', v => Math.round(v)],
  width: ['宽度', v => Math.round(v)],
  length: ['长度', v => Math.round(v)],
  tick: ['伤害间隔', v => v.toFixed(2) + 's'],
  dps: ['每秒伤害', v => Math.round(v)],
  speed: ['弹速', v => Math.round(v)]
};

const UI = {
  /* ---------------- 基础元件 ---------------- */
  bar(ctx, x, y, w, h, pct, fg, bg, radius, glow) {
    pct = clamp(pct, 0, 1);
    ctx.fillStyle = bg || 'rgba(255,255,255,0.10)';
    roundRect(ctx, x, y, w, h, radius === undefined ? h / 2 : radius);
    ctx.fill();
    if (pct > 0) {
      ctx.save();
      roundRect(ctx, x, y, Math.max(h, w * pct), h, radius === undefined ? h / 2 : radius);
      ctx.clip();
      ctx.fillStyle = fg;
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
      ctx.fill();
      ctx.restore();
    }
  },

  label(ctx, text, x, y, size, color, weight, align, baseline) {
    ctx.font = font(size || 14, weight || 600);
    ctx.fillStyle = color || C.ink;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(text, x, y);
  },

  /* 程序化金币：不依赖 emoji 字体，避免 🪙 在部分 Windows 上显示成方框 */
  coin(ctx, x, y, r, opt) {
    opt = opt || {};
    const a = opt.alpha === undefined ? 1 : opt.alpha;
    if (!(r > 0.5)) return;
    ctx.save();
    ctx.globalAlpha = a;
    if (opt.glow !== false) {
      ctx.shadowColor = 'rgba(255,183,3,0.75)';
      ctx.shadowBlur = r * 1.6;
    }
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.45, '#ffd166');
    g.addColorStop(0.75, '#f0a81e');
    g.addColorStop(1, '#b87300');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(90,52,0,0.85)';
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.stroke();

    // 内圈 + 四角星高光，小尺寸也能看清是金币而不是黄点
    ctx.strokeStyle = 'rgba(255,248,210,0.85)';
    ctx.lineWidth = Math.max(0.7, r * 0.09);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,252,225,0.95)';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 4;
      const rr = i % 2 === 0 ? r * 0.46 : r * 0.17;
      const px = x + Math.cos(ang) * rr;
      const py = y + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  /* 金币数值：金币图标 + 数字，支持左 / 中 / 右对齐 */
  goldLabel(ctx, value, x, y, size, color, weight, align) {
    const text = typeof value === 'string' ? value : fmtGold(value);
    const s = size || 14;
    ctx.font = font(s, weight || 800);
    const tw = ctx.measureText(text).width;
    const r = s * 0.46;
    const gap = s * 0.34;
    const total = r * 2 + gap + tw;
    let sx = x;
    if (align === 'right') sx = x - total;
    else if (align === 'center') sx = x - total / 2;
    this.coin(ctx, sx + r, y, r);
    this.label(ctx, text, sx + r * 2 + gap, y, s, color || C.gold, weight || 800, 'left');
  },

  skillIcon(ctx, id, x, y, size, color, glyph) {
    if (Assets.icon(ctx, id, x, y, size)) return true;
    this.label(ctx, glyph || '?', x, y, size * 0.78, color, 700, 'center');
    return false;
  },

  /* WoW 风格方形图标框: 斜切高光 + 金属内框 + 深色底 */
  iconTile(ctx, x, y, size, opt) {
    opt = opt || {};
    const half = size / 2;
    const rad = size * 0.15;
    const col = opt.color || C.accent;
    ctx.save();
    if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
    ctx.translate(x, y);
    if (opt.scale) ctx.scale(opt.scale, opt.scale);
    if (opt.glow) {
      ctx.shadowColor = opt.glowColor || col;
      ctx.shadowBlur = opt.glow;
    }
    // 外框
    ctx.fillStyle = 'rgba(6,9,16,0.97)';
    ctx.strokeStyle = opt.maxed ? '#ffd166' : col;
    ctx.lineWidth = opt.maxed ? 2.4 : 1.7;
    roundRect(ctx, -half, -half, size, size, rad);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 斜切高光
    ctx.save();
    roundRect(ctx, -half + 1.5, -half + 1.5, size - 3, size - 3, rad * 0.8);
    ctx.clip();
    const gloss = ctx.createLinearGradient(-half, -half, half, half);
    gloss.addColorStop(0, 'rgba(255,255,255,0.20)');
    gloss.addColorStop(0.38, 'rgba(255,255,255,0.05)');
    gloss.addColorStop(0.62, 'rgba(255,255,255,0)');
    gloss.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = gloss;
    ctx.fillRect(-half, -half, size, size);
    ctx.restore();

    // 内框
    ctx.strokeStyle = opt.maxed ? 'rgba(255,233,168,0.9)' : 'rgba(210,230,255,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, -half + 3, -half + 3, size - 6, size - 6, rad * 0.65);
    ctx.stroke();

    // 图标
    const inner = size * 0.78;
    let drawn = false;
    const iconOpt = { time: opt.time, flipX: opt.flipX, alpha: 1 };
    if (opt.iconCat === 'talent') {
      drawn = Assets.talentIcon(ctx, opt.iconKey, 0, 0, inner, iconOpt);
    } else if (opt.iconCat === 'skill') {
      drawn = Assets.icon(ctx, opt.iconKey, 0, 0, inner, iconOpt);
    }
    if (!drawn) {
      this.label(ctx, opt.glyph || '?', 0, 0, size * 0.5, opt.maxed ? '#ffe9a8' : col, 700, 'center');
    }

    if (opt.locked) {
      ctx.fillStyle = 'rgba(3,5,10,0.55)';
      roundRect(ctx, -half + 1, -half + 1, size - 2, size - 2, rad);
      ctx.fill();
    }
    ctx.restore();
  },

  /* ---------------- 世界 ---------------- */
  drawWorld(g) {
    const ctx = g.ctx;
    const W = CONTENT.world;

    ctx.fillStyle = '#070910';
    ctx.fillRect(-200, -200, W.w + 400, W.h + 400);

    // 1~3 号场景背景图; 没图时继续画程序化地板
    const hasScene = Assets.drawCover(ctx, 'background', g.scene,
      W.w / 2, W.h / 2, W.w, W.h);

    // 地板网格 (只有矢量回退时显示, 避免盖住背景画)
    if (!hasScene) {
      ctx.strokeStyle = 'rgba(90,140,255,0.075)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= W.w; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, W.h); }
      for (let y = 0; y <= W.h; y += 80) { ctx.moveTo(0, y); ctx.lineTo(W.w, y); }
      ctx.stroke();
    }

    // 竞技场边界
    ctx.save();
    ctx.shadowColor = 'rgba(99,230,255,0.55)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(99,230,255,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, W.w, W.h);
    ctx.restore();

    this.drawGround(g);
    this.drawZones(g);
    VFX.draw(ctx, 'ground');
    this.drawGems(g);
    this.drawEnemies(g);
    this.drawPlayer(g);
    this.drawProjectiles(g);
    VFX.draw(ctx, 'over');
    FX.draw(ctx);
  },

  drawGround(g) {
    const ctx = g.ctx;
    const p = g.player;
    const def = CONTENT.classes[p.classId];
    const col = def ? def.color : '#63e6ff';
    const grad = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, 88);
    grad.addColorStop(0, 'rgba(99,230,255,0.06)');
    grad.addColorStop(1, 'rgba(99,230,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 88, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 54 + Math.sin(p.walk) * 3, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },

  drawZones(g) {
    const ctx = g.ctx;
    for (let i = 0; i < g.zones.length; i++) {
      const z = g.zones[i];
      if (!z.dead) VFX.drawZone(ctx, z);
    }
  },

  drawGems(g) {
    const ctx = g.ctx;
    for (let i = 0; i < g.gems.length; i++) {
      const gem = g.gems[i];
      if (gem.dead) continue;
      const pulse = 1 + Math.sin(gem.t) * 0.15;
      ctx.save();
      ctx.translate(gem.x, gem.y);
      ctx.rotate(gem.t * 0.5);
      if (gem.heal) {
        ctx.fillStyle = '#5be08a';
        ctx.shadowColor = '#5be08a';
        ctx.shadowBlur = 12;
      } else if (gem.gold) {
        ctx.fillStyle = '#ffd166';
        ctx.shadowColor = '#ffb703';
        ctx.shadowBlur = 14;
      } else {
        ctx.fillStyle = gem.value >= 10 ? '#ffe066' : '#63e6ff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
      }
      const r = gem.r * pulse;
      if (gem.gold) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,70,0,0.7)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = 'rgba(120,70,0,0.65)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.8, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r * 0.8, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  },

  drawEnemies(g) {
    const ctx = g.ctx;
    const p = g.player;
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead) continue;
      const col = e.color;

      // 影子（Boss 贴图更大，阴影要落在脚底）
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * (e.boss ? 1.35 : 0.75),
        e.r * (e.boss ? 1.15 : 0.85), e.r * (e.boss ? 0.40 : 0.35), 0, 0, TAU);
      ctx.fill();

      // Boss 特色机制前摇提示：蓄力圈 / 冲锋线 / 龙息扇形
      if (e.boss && e.windup > 0) {
        ctx.save();
        ctx.globalAlpha = 0.55 + Math.sin(e.t * 24) * 0.2;
        ctx.strokeStyle = e.baseColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 14, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([10, 8]);
        if (e.windupKind === 'charge') {
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(e.chargeA) * 240, e.y + Math.sin(e.chargeA) * 240);
          ctx.stroke();
        } else if (e.windupKind === 'breath') {
          const a = e.breathA == null ? angTo(e.x, e.y, p.x, p.y) : e.breathA;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r + 46, a - 0.35, a + 0.35);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 优先用图片: 叠加轻微呼吸/浮空/挤压, 避免全员都是静止贴纸
      let drawn = false;
      const face = e.x < p.x ? -1 : 1;
      let bob = 0, tilt = 0, sx = 1, sy = 1;
      if (e.boss) {
        bob = Math.sin(e.t * 1.7 + e.wob) * 2.6;
        tilt = Math.sin(e.t * 0.9 + e.wob) * 0.022;
      } else {
        bob = Math.sin(e.t * 6 + e.wob) * (e.type === 'bat' ? 3.2 : 1.1);
        tilt = Math.sin(e.t * 5 + e.wob) * 0.045;
        if (e.type === 'slime') {
          const sq = Math.sin(e.t * 7 + e.wob) * 0.055;
          sx += sq; sy -= sq;
        } else if (e.type === 'skeleton' || e.type === 'brute') {
          sy += Math.sin(e.t * 7 + e.wob) * 0.022;
        }
      }

      // Boss 脚下符文环: 让 Boss 看起来在"浮"着
      if (e.boss) {
        ctx.save();
        ctx.translate(e.x, e.y + e.r * 0.9);
        ctx.scale(1, 0.45);
        ctx.rotate(e.t * 0.8);
        ctx.globalAlpha = 0.38 + 0.16 * Math.sin(e.t * 3);
        ctx.strokeStyle = e.baseColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 9]);
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 1.25, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.save();
      ctx.translate(e.x, e.y + bob);
      ctx.scale(face, 1);
      ctx.rotate(tilt);
      ctx.scale(sx, sy);
      if (e.flash > 0 && ctx.filter !== undefined) ctx.filter = 'brightness(1.9) saturate(0.45)';
      const esize = e.r * 2.7;
      if (e.boss) {
        // 暗色外发光当描边，避免 Boss 和地面糊在一起
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 8;
        Assets.draw(ctx, 'boss', e.art || e.tier, 0, 0, esize, esize, {
          time: e.t, alpha: e.flash > 0 ? 0.8 : 1
        });
        ctx.restore();
        drawn = Assets.draw(ctx, 'boss', e.art || e.tier, 0, 0, esize, esize, {
          time: e.t, alpha: e.flash > 0 ? 0.95 : 1
        });
      } else {
        drawn = Assets.draw(ctx, 'enemy', e.type, 0, 0, esize, esize, {
          time: e.t, alpha: e.flash > 0 ? 0.9 : 1
        });
      }
      ctx.restore();

      // 施法前摇的枪口/法印光
      if (e.castT > 0) {
        const pal = vfxPal(e.castStyle || 'shadow');
        const ca = e.castA || 0;
        const mx = e.x + Math.cos(ca) * e.r * 1.35;
        const my = e.y + Math.sin(ca) * e.r * 0.45;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(e.castT * 5, 0, 0.9);
        vfxGlow(ctx, mx, my, e.r * 1.8, pal[1], 0.85);
        ctx.restore();
      }

      if (!drawn) {
        ctx.save();
        ctx.translate(e.x, e.y);
        if (e.boss || e.elite) {
          ctx.shadowColor = col;
          ctx.shadowBlur = e.boss ? 26 : 16;
        }
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 2;

        if (e.boss) {
          ctx.save();
          ctx.rotate(e.rot * 0.6);
          ctx.strokeStyle = 'rgba(208,191,255,0.55)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = k * TAU / 6;
            ctx.moveTo(Math.cos(a) * (e.r + 6), Math.sin(a) * (e.r + 6));
            ctx.lineTo(Math.cos(a) * (e.r + 16), Math.sin(a) * (e.r + 16));
          }
          ctx.stroke();
          ctx.restore();

          polyPath(ctx, 0, 0, e.r, 12, e.rot * 0.4);
          ctx.fill();
          ctx.stroke();

          const eyeGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, e.r * 0.55);
          eyeGrad.addColorStop(0, '#fff');
          eyeGrad.addColorStop(0.35, '#ff6bd6');
          eyeGrad.addColorStop(1, 'rgba(60,20,80,0.9)');
          ctx.fillStyle = eyeGrad;
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.52, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#12060f';
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.2, 0, TAU);
          ctx.fill();
        } else if (e.ai === 'erratic') {
          const flap = Math.sin(e.t * 14) * 0.5;
          ctx.beginPath();
          ctx.moveTo(e.r * 1.5, 0);
          ctx.lineTo(-e.r * 0.6, -e.r * 0.9 - flap * e.r);
          ctx.lineTo(-e.r * 0.2, 0);
          ctx.lineTo(-e.r * 0.6, e.r * 0.9 + flap * e.r);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (e.ai === 'ranged') {
          polyPath(ctx, 0, 0, e.r, 5, e.rot);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.3, 0, TAU);
          ctx.fill();
        } else if (e.type === 'brute') {
          polyPath(ctx, 0, 0, e.r, 8, e.rot * 0.5);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-e.r * 0.5, -e.r * 0.2);
          ctx.lineTo(e.r * 0.1, e.r * 0.15);
          ctx.lineTo(e.r * 0.6, -e.r * 0.1);
          ctx.stroke();
        } else if (e.type === 'skeleton') {
          polyPath(ctx, 0, 0, e.r, 4, Math.PI / 4 + e.rot * 0.2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(20,22,30,0.85)';
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.34, 0, TAU);
          ctx.fill();
        } else {
          const wob = 1 + Math.sin(e.t * 6 + e.wob) * 0.09;
          ctx.beginPath();
          ctx.arc(0, 0, e.r * wob, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath();
          ctx.arc(-e.r * 0.3, -e.r * 0.25, e.r * 0.22, 0, TAU);
          ctx.arc(e.r * 0.3, -e.r * 0.25, e.r * 0.22, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      // 精英金环
      if (e.elite) {
        ctx.strokeStyle = 'rgba(255,224,102,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 5, 0, TAU);
        ctx.stroke();
      }

      // 血条(受伤后)
      if (e.hp < e.maxHp && !e.boss) {
        const bw = e.r * 2;
        const pct = e.hp / e.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 9, bw, 4);
        ctx.fillStyle = pct > 0.5 ? '#7ee787' : (pct > 0.25 ? '#ffd166' : '#ff6b8b');
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 9, bw * pct, 4);
      }
    }
  },

  drawPlayer(g) {
    const ctx = g.ctx;
    const p = g.player;
    const cls = CONTENT.classes[p.classId] || CONTENT.classes.warrior;
    const col = cls.color;
    const pose = p.animPose ? p.animPose() : { bob: 0, rot: 0, sx: 1, sy: 1, lunge: 0, lift: 0 };
    const face = p.facing || (p.lastMove.x < 0 ? -1 : 1);
    const psize = p.r * 5.2;                 // 比旧的 4r 稍大，Q 版细节更清楚
    const skinKey = p.skinKey || p.classId;
    const entry = Assets.entry('player', skinKey);
    const atkEntry = Assets.entry('player', skinKey + '_attack');

    // 残影: 平时是淡淡的拖尾, 冲刺时拉长变亮
    const dash = p.attack && p.attack.kind === 'dash';
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i];
      const k = t.life / 0.22;
      ctx.globalAlpha = k * (dash ? 0.42 : 0.18);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, p.r * (dash ? 1.2 : 0.8) * k, p.r * 0.7 * k, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 冲刺残影: 直接复制人物 PNG, 比圆点更像高速移动
    if (dash && entry && entry.ready) {
      const art = this.playerArt(p, skinKey);
      for (let i = 1; i <= 3; i++) {
        const t = p.trail[Math.max(0, p.trail.length - 1 - i * 3)];
        if (!t) continue;
        ctx.save();
        ctx.globalAlpha = 0.12 * (4 - i);
        ctx.translate(t.x, t.y + pose.bob * 0.5);
        ctx.scale(art.flip, 1);
        Assets.draw(ctx, 'player', art.key, 0, 0, psize, psize, { frame: art.frame, time: p.walk, alpha: 1 });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // 脚下阴影：随起跳/冲刺收缩
    const shadowK = 1 - Math.max(0, pose.lift || 0) * 0.018;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.r * 1.95,
      p.r * 1.35 * shadowK, p.r * 0.42 * shadowK, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 先画一层暗色外发光当描边，再画正常图。
    // 受伤闪白时也保持 PNG 可见，不再回退成矢量图标。
    let drawn = false;
    if (entry && entry.ready) {
      const attackK = (p.attack && atkEntry && atkEntry.ready)
        ? Math.min(1, Math.sin(clamp(p.attack.t / p.attack.dur, 0, 1) * Math.PI) * 1.6)
        : 0;
      const baseAlpha = 1 - attackK;
      const flash = p.flash > 0;

      // 描边层 + 主图: 基础形象至少绘制两次, 受伤闪白时也不会只剩矢量
      this.drawPlayerSprite(ctx, p, skinKey, psize, pose, face, {
        outline: true, alpha: baseAlpha, flash
      });
      this.drawPlayerSprite(ctx, p, skinKey, psize, pose, face, {
        alpha: baseAlpha, flash
      });

      if (attackK > 0.02) {
        // 有专属攻击姿态时, 出招瞬间交叉淡入, 像逐帧动画
        this.drawPlayerSprite(ctx, p, skinKey + '_attack', psize, pose, face, {
          outline: true, alpha: attackK, flash, time: p.attack.t
        });
      }
      drawn = true;
    }

    if (!drawn) {
      ctx.save();
      ctx.translate(p.x + pose.lunge * face, p.y + pose.bob + (pose.lift || 0));
      ctx.scale(face * pose.sx, pose.sy);
      ctx.rotate(pose.rot);

      if (p.iframe > 0 && Math.floor(p.iframe * 20) % 2 === 0) ctx.globalAlpha = 0.45;

      ctx.shadowColor = p.flash > 0 ? '#ff6b8b' : col;
      ctx.shadowBlur = 18;

      ctx.fillStyle = p.flash > 0 ? '#ffffff' : '#0e2433';
      ctx.strokeStyle = p.flash > 0 ? '#ff9fb2' : col;
      ctx.lineWidth = 2.5;
      // 形象 1 菱形, 形象 2 三角; 没图时也能看出选择差异
      polyPath(ctx, 0, 0, p.r, p.skin === 2 ? 3 : 4, p.face + Math.PI / 2 + Math.PI / 4);
      ctx.fill();
      ctx.stroke();

      const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, p.r * 0.72);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.45, col);
      cg.addColorStop(1, 'rgba(30,120,180,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 0.72, 0, TAU);
      ctx.fill();

      ctx.restore();
      ctx.shadowBlur = 0;
    }

    // 施法法阵 / 手心光球 / 剑刃风暴
    VFX.drawPlayerCast(ctx, p, g);

    // 护盾
    if (p.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(g.time * 6);
      ctx.strokeStyle = C.shield;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 + g.time * 0.6;
        const rr = p.r + 10 + Math.sin(g.time * 4 + i) * 2;
        const x = p.x + Math.cos(a) * rr;
        const y = p.y + Math.sin(a) * rr * 0.85;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 无敌
    if (p.invuln > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#eaf6ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 15, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  },

  /* ---------------- 朝向图集 ----------------
     4 帧模式(当前): 0 东南 / 1 南 / 2 西南 / 3 北
        不用纯左右侧面(侧脸在小尺寸下不好看), 平移时用侧前方四分之三视角。
     8 帧模式(旧):   0 东 / 1 东南 / 2 南 / 3 西南 / 4 西 / 5 西北 / 6 北 / 7 东北
        按素材条目的 frames 自动选择, 放 4 帧就是 4 向, 放 8 帧就是 8 向。
     没有 <key>_dir 素材时就退回单图 + 水平翻转, 行为与旧版完全一致。 */
  dirFrameIndex(p, frames) {
    // p.face 是玩家当前朝向角(移动时更新, 出招时转向目标), 没有就退回移动方向
    let a;
    if (typeof p.face === 'number') a = p.face;
    else {
      const m = p.lastMove;
      a = (m && (m.x || m.y)) ? Math.atan2(m.y, m.x) : 0;
    }

    if (frames === 8) return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;

    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const EPS = 0.38;                      // ≈22°: 小于它算"正上/正下/正左右"
    if (dy < -EPS) return 3;               // 往上走 → 背面
    if (dy > EPS) {
      if (dx > EPS) return 0;              // 右下 → 东南
      if (dx < -EPS) return 2;             // 左下 → 西南
      return 1;                            // 正下 → 正面
    }
    return dx >= 0 ? 0 : 2;                // 纯左右 → 侧前方四分之三
  },

  playerArt(p, skinKey) {
    const dirEntry = Assets.entry('player', skinKey + '_dir');
    if (dirEntry && dirEntry.ready && dirEntry.frames > 1) {
      return { key: skinKey + '_dir', frame: this.dirFrameIndex(p, dirEntry.frames), flip: 1 };
    }
    return {
      key: skinKey,
      frame: undefined,
      flip: p.facing || (p.lastMove.x < 0 ? -1 : 1)
    };
  },

  drawPlayerSprite(ctx, p, key, size, pose, face, opt) {
    opt = opt || {};
    const art = this.playerArt(p, key);
    ctx.save();
    ctx.translate(p.x + pose.lunge * face, p.y + pose.bob + (pose.lift || 0));
    ctx.scale(art.flip, 1);
    ctx.rotate(pose.rot);
    ctx.scale(pose.sx, pose.sy);

    if (opt.outline) {
      ctx.shadowColor = 'rgba(0,0,0,0.92)';
      ctx.shadowBlur = 8;
    }
    if (opt.flash) {
      ctx.filter = 'brightness(1.9) saturate(0.45)';
      ctx.shadowColor = 'rgba(255,240,245,0.95)';
      ctx.shadowBlur = 16;
    }
    Assets.draw(ctx, 'player', art.key, 0, 0, size, size, {
      frame: art.frame,
      time: opt.time !== undefined ? opt.time : p.walk,
      alpha: opt.alpha === undefined ? 1 : opt.alpha
    });
    ctx.restore();
  },

  drawProjectiles(g) {
    const ctx = g.ctx;
    for (let i = 0; i < g.projectiles.length; i++) {
      const pr = g.projectiles[i];
      if (!pr.dead) VFX.drawProjectile(ctx, pr);
    }
  },

  /* ---------------- HUD ---------------- */
  drawHUD(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;
    const p = g.player;
    const cls = CONTENT.classes[p.classId] || CONTENT.classes.warrior;

    // 顶部经验条
    const xpPct = p.xp / p.xpNeed;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, 0, w, 10);
    const xg = ctx.createLinearGradient(0, 0, w, 0);
    xg.addColorStop(0, '#2b8fff');
    xg.addColorStop(1, '#63e6ff');
    ctx.fillStyle = xg;
    ctx.shadowColor = '#63e6ff';
    ctx.shadowBlur = 12;
    ctx.fillRect(0, 0, w * clamp(xpPct, 0, 1), 10);
    ctx.shadowBlur = 0;

    // 等级徽章
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,28,0.9)';
    ctx.strokeStyle = 'rgba(99,230,255,0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 16, 20, 64, 34, 10);
    ctx.fill();
    ctx.stroke();
    this.label(ctx, 'Lv', 26, 37, 12, C.dim, 700);
    this.label(ctx, String(p.level), 52, 37, 19, C.accent, 800);
    ctx.restore();

    // 职业徽章
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,28,0.82)';
    ctx.strokeStyle = cls.color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.2;
    roundRect(ctx, 88, 20, 116, 34, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.label(ctx, cls.icon, 106, 37, 16, cls.color, 700, 'center');
    this.label(ctx, cls.name, 120, 37, 13, cls.color, 700);

    // 计时
    this.label(ctx, fmtTime(g.t), w / 2, 38, 24, 'rgba(232,240,255,0.9)', 700, 'center');

    // 难度徽章
    this.label(ctx, g.mods.name, w - 24, 58, 11, g.mods.color, 700, 'right');

    // 威胁等级: 9 格刻度 + 名称, 让「怪越来越硬」有可读的进度
    const th = g.threat || 1;
    const thName = CONTENT.threat.names[th - 1];
    const thCol = CONTENT.threat.colors[th - 1];
    const thX = 20, thY = 64;
    this.label(ctx, '威胁', thX, thY, 10, C.dim, 700);
    this.label(ctx, th + ' ' + thName, thX + 30, thY, 11, thCol, 700);
    const pipN = 9, pipW = 12, pipGap = 3;
    const pipX = thX + 30 + 52;
    for (let i = 0; i < pipN; i++) {
      const on = i < th;
      const last = i === th - 1;
      ctx.fillStyle = on ? (last ? thCol : 'rgba(120,170,255,0.45)') : 'rgba(255,255,255,0.09)';
      roundRect(ctx, pipX + i * (pipW + pipGap), thY - 5, pipW, 10, 3);
      ctx.fill();
      if (last && g.threatFlash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, g.threatFlash) * 0.8;
        ctx.strokeStyle = thCol;
        ctx.lineWidth = 2;
        roundRect(ctx, pipX + i * (pipW + pipGap) - 2, thY - 7, pipW + 4, 14, 4);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 下一只 Boss 倒计时
    let nextBoss = null;
    for (let i = 0; i < CONTENT.bossTimes.length; i++) {
      if (CONTENT.bossTimes[i] > g.t) { nextBoss = CONTENT.bossTimes[i]; break; }
    }
    const countdown = nextBoss
      ? '距离下一只 Boss ' + fmtTime(nextBoss - g.t)
      : '最终 Boss 已降临';
    this.label(ctx, countdown, w / 2, 58, 12, C.dim, 600, 'center');

    // Boss 血条堆叠
    let bossRows = 0;
    if (g.bosses.length) {
      const bw = Math.min(540, w - 160);
      const bx = (w - bw) / 2;
      for (let i = 0; i < g.bosses.length && i < 5; i++) {
        const b = g.bosses[i];
        if (!b || b.dead) continue;
        const y = 78 + bossRows * 30;
        this.label(ctx, b.name + (b.tag ? ' · ' + b.tag : '') + '  ' + (bossRows + 1) + '/' + g.bosses.length,
          w / 2, y - 8, 11, b.baseColor, 700, 'center');
        // 狂暴倒计时: 让 DPS 门槛提前可见, 而不是突然开始回血
        if (b.enraged) {
          this.label(ctx, '狂暴中', bx + bw, y - 8, 10, '#ff6b8b', 700, 'right');
        } else if (b.enrageLim && b.aliveT !== undefined) {
          const left = b.enrageLim - b.aliveT;
          if (left <= 15) this.label(ctx, '狂暴 ' + Math.ceil(left) + 's', bx + bw, y - 8, 10, '#ffa94d', 700, 'right');
        }
        this.bar(ctx, bx, y, bw, 10, b.hp / b.maxHp, b.baseColor,
          'rgba(255,255,255,0.10)', 5, b.baseColor);
        bossRows++;
      }
    }

    // 击杀数
    this.label(ctx, '☠ ' + g.kills, w - 24, 34, 17, 'rgba(232,240,255,0.8)', 700, 'right');

    // 本局金币（只有槽位模式才产出）
    if (g.runMode === 'slot') {
      ctx.save();
      ctx.shadowColor = 'rgba(255,183,3,0.45)';
      ctx.shadowBlur = 8;
      this.goldLabel(ctx, g.runGold, w - 24, 80, 14, '#ffd166', 700, 'right');
      ctx.restore();
    }

    // 血量
    const hpW = 268;
    const hpX = 20;
    const hpY = h - 92;
    this.label(ctx, 'HP', hpX, hpY - 13, 11, C.dim, 700);
    this.bar(ctx, hpX, hpY, hpW, 16, p.hp / p.maxHp,
      p.hp / p.maxHp > 0.35 ? '#ff5c7a' : '#ff2d55', 'rgba(255,255,255,0.10)', 8, '#ff5c7a');
    if (p.shield > 0) {
      const sw = Math.min(1, p.shield / p.maxHp) * hpW;
      ctx.fillStyle = 'rgba(142,203,255,0.9)';
      ctx.fillRect(hpX, hpY, sw, 4);
    }
    this.label(ctx, Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp), hpX + hpW / 2, hpY + 8.5, 11,
      'rgba(255,255,255,0.92)', 700, 'center');
    if (p.shield > 0) {
      this.label(ctx, '护盾 ' + Math.ceil(p.shield), hpX + hpW + 10, hpY + 8, 10, C.shield, 700);
    }

    // 技能槽
    const slotY = h - 56;
    for (let i = 0; i < CONTENT.maxSkills; i++) {
      const wx = 20 + i * 44;
      const sw = p.skills[i];
      ctx.save();
      ctx.fillStyle = 'rgba(8,12,20,0.75)';
      ctx.strokeStyle = sw ? 'rgba(99,230,255,0.35)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.2;
      roundRect(ctx, wx, slotY, 38, 38, 8);
      ctx.fill();
      ctx.stroke();
      if (sw) {
        const des = CONTENT.skills[sw.id];
        this.skillIcon(ctx, sw.id, wx + 19, slotY + 15, 22, des.color, des.icon);
        for (let k = 0; k < des.lvl.length; k++) {
          ctx.fillStyle = k < sw.lvl ? des.color : 'rgba(255,255,255,0.15)';
          ctx.beginPath();
          ctx.arc(wx + 8 + k * 6.5, slotY + 32, 1.9, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 独立位移技能（空格 / 2 层充能）
    if (p.displacement) {
      const d = p.displacement;
      const def = CONTENT.skills[d.id];
      const dx = 20 + CONTENT.maxSkills * 44 + 6;
      const dy = slotY;
      const dw = 46, dh = 38;
      const ready = d.charges > 0;
      ctx.save();
      ctx.fillStyle = ready ? 'rgba(15,22,36,0.92)' : 'rgba(8,12,20,0.75)';
      ctx.strokeStyle = ready ? def.color : 'rgba(120,150,190,0.25)';
      ctx.lineWidth = ready ? 1.4 : 1;
      if (ready) {
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 9;
      }
      roundRect(ctx, dx, dy, dw, dh, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = ready ? 1 : 0.45;
      this.skillIcon(ctx, d.id, dx + dw / 2, dy + 17, 23, def.color, def.icon);
      ctx.globalAlpha = 1;
      ctx.globalAlpha = ready ? 1 : 0.4;
      this.label(ctx, '空格 · Lv' + p.dispLevel(), dx + dw / 2, dy - 10, 10, ready ? def.color : C.dim, 700, 'center');
      ctx.globalAlpha = 1;
      // 充能点
      for (let k = 0; k < d.max; k++) {
        const on = k < d.charges;
        ctx.fillStyle = on ? def.color : 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.arc(dx + dw / 2 - 7 + k * 14, dy + dh - 7, 2.6, 0, TAU);
        ctx.fill();
      }
      // 充能进度弧
      if (d.charges < d.max && d.maxT > 0) {
        const pct = 1 - clamp(d.t / d.maxT, 0, 1);
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dx + dw / 2, dy + 17, 16, -Math.PI / 2, -Math.PI / 2 + TAU * pct);
        ctx.stroke();
      }
      if (!ready && d.t > 0) {
        this.label(ctx, Math.ceil(d.t) + 's', dx + dw - 3, dy + 4, 9,
          'rgba(210,225,255,0.8)', 700, 'right');
      }
      ctx.restore();
    }

    // 被动图标
    let px = w - 24;
    const py = h - 44;
    for (const id in p.passives) {
      const lv = p.passives[id];
      const def = CONTENT.passives[id];
      if (!def) continue;
      px -= 34;
      if (px < w * 0.5) break;
      ctx.fillStyle = 'rgba(8,12,20,0.72)';
      ctx.strokeStyle = 'rgba(255,209,102,0.28)';
      ctx.lineWidth = 1;
      roundRect(ctx, px, py - 15, 28, 28, 7);
      ctx.fill();
      ctx.stroke();
      this.label(ctx, def.icon, px + 14, py - 1, 14, '#ffe9a8', 700, 'center');
      this.label(ctx, String(lv), px + 24, py + 8, 9, C.gold, 800, 'center');
    }

    // 临时增益
    let bx = hpX;
    for (const id in p.buffs) {
      const def = CONTENT.skills[id];
      if (!def) {
        if (id === 'talent_fury') {
          ctx.fillStyle = 'rgba(8,12,20,0.72)';
          ctx.strokeStyle = 'rgba(255,209,102,0.6)';
          ctx.lineWidth = 1;
          roundRect(ctx, bx, hpY - 46, 30, 26, 6);
          ctx.fill();
          ctx.stroke();
          this.label(ctx, '⚡', bx + 15, hpY - 33, 15, C.gold, 700, 'center');
          bx += 34;
        }
        continue;
      }
      ctx.fillStyle = 'rgba(8,12,20,0.72)';
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1;
      roundRect(ctx, bx, hpY - 46, 30, 26, 6);
      ctx.fill();
      ctx.stroke();
      this.skillIcon(ctx, id, bx + 15, hpY - 33, 17, def.color, def.icon);
      bx += 34;
    }

    // 提示
    this.label(ctx, 'P 暂停', w - 24, h - 76, 11, 'rgba(200,220,255,0.3)', 600, 'right');

    // 公告
    if (g.announceT > 0) {
      const k = Math.min(1, g.announceT / 0.4);
      const ay = bossRows ? 78 + bossRows * 30 + 22 : 132;
      ctx.globalAlpha = k;
      this.label(ctx, g.announceText, w / 2, ay, 22, '#ffd166', 800, 'center');
      ctx.globalAlpha = 1;
    }
  },

  /* ---------------- 升级选择 ---------------- */
  /* 全屏 UI 的缩放系数: 只作用于覆盖层(选卡/天赋/结算), 世界层仍用 zoom。
     旧版所有面板写死 CSS px, 4K 屏上 48px 图标只有屏幕高度的 2%, 所以「看着很小」。 */
  uiScale(g) {
    const h = g && g.view ? g.view.h : 720;
    return clamp(h / 820, 1, 1.5);
  },

  cardRects(g) {
    const { w, h } = g.view;
    const s = this.uiScale(g);
    const n = Math.max(1, g.offers.length);
    const gap = 20 * s;
    const cw = Math.min(348 * s, (w - 80) / n - gap);
    const icon = Math.min(120 * s, cw * 0.42);
    const ch = Math.min(icon + 176 * s, h * 0.54);
    const total = n * cw + (n - 1) * gap;
    const x0 = (w - total) / 2;
    const y = h * 0.5 - ch / 2 + 22 * s;
    const rects = [];
    for (let i = 0; i < n; i++) {
      rects.push({ x: x0 + i * (cw + gap), y, w: cw, h: ch, i, icon, s });
    }
    return rects;
  },

  /* 悬停详情固定在卡片下方(放不下就翻到上方), 跟着鼠标会挡住相邻的卡 */
  offerDetailRect(g, card) {
    const { w, h } = g.view;
    const s = this.uiScale(g);
    const pw = Math.min(840 * s, w - 60);
    const ph = 152 * s;
    let y = card.y + card.h + 14 * s;
    if (y + ph > h - 12) y = Math.max(12, card.y - ph - 14 * s);
    return { x: (w - pw) / 2, y, w: pw, h: ph };
  },

  /* 当前等级 -> 下一等级的可读数值差, 例如 [{label:'伤害', from:'47', to:'62'}] */
  skillCompare(def, from, to) {
    const out = [];
    if (!def || !def.lvl) return out;
    const a = from > 0 ? def.lvl[from - 1] : null;
    const b = def.lvl[to - 1];
    if (!b) return out;
    for (const k in SKILL_FIELDS) {
      if (b[k] === undefined) continue;
      const prev = a && a[k] !== undefined ? a[k] : null;
      if (prev !== null && prev === b[k]) continue;
      const f = SKILL_FIELDS[k];
      out.push({
        label: f[0],
        from: prev === null ? null : f[1](prev),
        to: f[1](b[k])
      });
    }
    const pa = a && a.dot ? a.dot.dps : null;
    const pb = b.dot ? b.dot.dps : null;
    if (pb !== null && pa !== pb) {
      out.push({ label: '灼烧', from: pa === null ? null : pa + '/s', to: pb + '/s' });
    }
    return out;
  },

  drawOfferDetail(g, o, card) {
    const ctx = g.ctx;
    const s = this.uiScale(g);
    const r = this.offerDetailRect(g, card);
    const pad = 16 * s;
    const def = o.kind === 'passive' ? null : CONTENT.skills[o.id];

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(7,11,20,0.97)';
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 1.4;
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 顶部色条
    ctx.fillStyle = vfxRgba(o.color, 0.55);
    roundRect(ctx, r.x + pad, r.y + 1, r.w - pad * 2, 2 * s, 1);
    ctx.fill();

    // 标题行
    this.iconTile(ctx, r.x + pad + 18 * s, r.y + 30 * s, 34 * s, {
      color: o.color,
      iconCat: o.kind === 'passive' ? null : 'skill',
      iconKey: o.kind === 'passive' ? null : o.id,
      glyph: o.icon, time: g.time
    });
    this.label(ctx, o.title, r.x + pad + 44 * s, r.y + 24 * s, Math.round(18 * s), C.ink, 800);
    const lvText = o.kind === 'skill' ? '学习 · Lv 1' : ('Lv ' + o.from + ' → ' + o.to);
    this.label(ctx, lvText + '  ·  ' + o.tag, r.x + pad + 44 * s, r.y + 44 * s,
      Math.round(12 * s), o.color, 700);

    // 完整描述
    ctx.font = font(Math.round(13 * s), 500);
    const descLines = wrapText(ctx, o.desc, r.w - pad * 2);
    for (let i = 0; i < descLines.length && i < 2; i++) {
      this.label(ctx, descLines[i], r.x + pad, r.y + 70 * s + i * 18 * s,
        Math.round(13 * s), 'rgba(205,222,250,0.82)', 500);
    }

    // 数值对比
    const rows = def ? this.skillCompare(def, o.from, o.to) : [];
    if (rows.length) {
      let cx = r.x + pad;
      const cy = r.y + 112 * s;
      for (let i = 0; i < rows.length && i < 8; i++) {
        const row = rows[i];
        const text = row.from === null
          ? row.label + ' ' + row.to
          : row.label + ' ' + row.from + ' → ' + row.to;
        ctx.font = font(Math.round(11.5 * s), 600);
        const tw = ctx.measureText(text).width + 18 * s;
        if (cx + tw > r.x + r.w - pad) break;
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        roundRect(ctx, cx, cy - 9 * s, tw, 19 * s, 9 * s);
        ctx.fill();
        this.label(ctx, text, cx + tw / 2, cy, Math.round(11.5 * s),
          'rgba(225,238,255,0.9)', 600, 'center');
        cx += tw + 8 * s;
      }
    } else if (o.kind === 'passive') {
      this.label(ctx, '被动强化 · 每级独立叠加', r.x + pad, r.y + 112 * s,
        Math.round(11.5 * s), 'rgba(200,220,255,0.55)', 500);
    }
    ctx.restore();
  },

  drawLevelUp(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;
    const s = this.uiScale(g);

    ctx.fillStyle = 'rgba(3,5,10,0.78)';
    ctx.fillRect(0, 0, w, h);

    const rects = this.cardRects(g);
    const top = rects.length ? rects[0].y : h / 2;

    this.label(ctx, '等级提升', w / 2, top - 76 * s, Math.round(30 * s), C.accent, 800, 'center');
    this.label(ctx, '选择一项强化  ·  按 1 / 2 / 3 或点击  ·  悬停 / Tab 查看详细数值',
      w / 2, top - 44 * s, Math.round(13 * s), C.dim, 600, 'center');

    const mx = Input.mouse.x, my = Input.mouse.y;
    const onCard = (r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    const anyMouse = rects.some(onCard);
    // 纯键盘: Tab / 方向键选中一张, 鼠标一进卡片就让位给鼠标
    const focus = (!anyMouse && g.cardFocus >= 0 && g.cardFocus < rects.length) ? g.cardFocus : -1;
    let hovered = null;

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const o = g.offers[i];
      const hover = onCard(r) || r.i === focus;
      if (onCard(r) || r.i === focus) hovered = { o: o, r: r };
      const lift = hover ? -5 * s : 0;

      ctx.save();
      ctx.translate(0, lift);
      if (hover) {
        ctx.shadowColor = o.color;
        ctx.shadowBlur = 30;
      }
      ctx.fillStyle = hover ? 'rgba(18,28,46,0.98)' : 'rgba(9,13,22,0.94)';
      ctx.strokeStyle = hover ? o.color : 'rgba(120,170,255,0.22)';
      ctx.lineWidth = hover ? 2.2 : 1.4;
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 顶部色条
      ctx.fillStyle = vfxRgba(o.color, hover ? 0.9 : 0.5);
      roundRect(ctx, r.x + r.w / 2 - 34 * s, r.y + 13 * s, 68 * s, 3 * s, 2);
      ctx.fill();

      // 快捷数字
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, r.x + 12 * s, r.y + 12 * s, 24 * s, 24 * s, 7);
      ctx.fill();
      this.label(ctx, String(i + 1), r.x + 24 * s, r.y + 24 * s,
        Math.round(12 * s), C.dim, 700, 'center');

      // 竖向堆叠居中: 图标 → 名称 → 标签 → 等级
      const icon = r.icon;
      const stackH = icon + 26 * s + 21 * s + 12 * s + 22 * s + 20 * s + 26 * s;
      let cy = r.y + (r.h - stackH) / 2;

      // 大图标
      this.iconTile(ctx, r.x + r.w / 2, cy + icon / 2, icon, {
        color: o.color,
        iconCat: o.kind === 'passive' ? null : 'skill',
        iconKey: o.kind === 'passive' ? null : o.id,
        glyph: o.icon,
        glow: hover ? 24 : 12,
        glowColor: o.color,
        time: g.time
      });
      cy += icon + 26 * s;

      // 标题
      this.label(ctx, o.title, r.x + r.w / 2, cy,
        Math.round(21 * s), C.ink, 800, 'center');
      cy += 21 * s + 12 * s;

      // 类型标签
      const tagW = (o.kind === 'passive' ? 62 : 78) * s;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, r.x + r.w / 2 - tagW / 2, cy, tagW, 22 * s, 11 * s);
      ctx.fill();
      this.label(ctx, o.tag, r.x + r.w / 2, cy + 11 * s,
        Math.round(11 * s), o.color, 700, 'center');
      cy += 22 * s + 20 * s;

      // 只保留「等级升到多少」
      const lvText = o.kind === 'skill' ? 'Lv 1' : ('Lv ' + o.from + ' → ' + o.to);
      this.label(ctx, lvText, r.x + r.w / 2, cy,
        Math.round(23 * s), hover ? o.color : C.ink, 800, 'center');

      ctx.restore();
    }

    if (hovered) this.drawOfferDetail(g, hovered.o, hovered.r);
    else {
      const any = rects[rects.length - 1] || { y: h / 2, h: 0 };
      this.label(ctx, '把光标移到卡上查看技能说明与数值变化',
        w / 2, Math.min(h - 22, any.y + any.h + 34 * s),
        Math.round(12 * s), 'rgba(180,205,240,0.5)', 500, 'center');
    }
  },

  /* ---------------- 职业选择 ---------------- */
  drawMenuBackdrop(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;

    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < g.stars.length; i++) {
      const s = g.stars[i];
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(g.time * s.sp + s.ph));
      ctx.globalAlpha = tw * s.a;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    const grad = ctx.createRadialGradient(w / 2, h * 0.3, 10, w / 2, h * 0.3, h * 0.8);
    grad.addColorStop(0, 'rgba(60,140,255,0.14)');
    grad.addColorStop(1, 'rgba(5,6,10,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },

  drawDifficultyPills(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;
    this.label(ctx, '难度', w / 2, h - 142, 13, C.dim, 700, 'center');
    const dr = this.diffRects(g);
    const mx = Input.mouse.x, my = Input.mouse.y;
    for (let i = 0; i < dr.length; i++) {
      const r = dr[i];
      const def = CONTENT.difficulties[r.id];
      const on = g.difficulty === r.id;
      const hover = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
      ctx.fillStyle = on ? 'rgba(20,34,54,0.98)' : 'rgba(9,13,22,0.8)';
      ctx.strokeStyle = on ? def.color : (hover ? 'rgba(160,200,255,0.6)' : 'rgba(120,170,255,0.22)');
      ctx.lineWidth = on ? 2 : 1.2;
      roundRect(ctx, r.x, r.y, r.w, r.h, 20);
      ctx.fill();
      ctx.stroke();
      this.label(ctx, def.name, r.x + r.w / 2, r.y + r.h / 2, 15,
        on ? def.color : C.dim, 700, 'center');
    }
  },

  classRects(g) {
    const { w, h } = g.view;
    const cw = Math.min(330, (w - 110) / 2);
    const ch = Math.min(360, Math.max(280, h * 0.48));
    const gap = 26;
    const total = cw * 2 + gap;
    const x0 = (w - total) / 2;
    const y = Math.max(96, h / 2 - ch / 2 + 6);
    return [
      { id: 'warrior', x: x0, y, w: cw, h: ch },
      { id: 'mage', x: x0 + cw + gap, y, w: cw, h: ch }
    ];
  },

  diffRects(g) {
    const { w, h } = g.view;
    const pw = 118;
    const ph = 40;
    const gap = 14;
    const x0 = w / 2 - pw - gap / 2;
    const y = h - 118;
    return [
      { id: 'normal', x: x0, y, w: pw, h: ph },
      { id: 'hardcore', x: x0 + pw + gap, y, w: pw, h: ph }
    ];
  },

  drawClassSelect(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;

    this.drawMenuBackdrop(g);

    const slotNo = g.creatingSlot == null ? 1 : g.creatingSlot + 1;
    this.label(ctx, g.creatingSlot == null ? '选择职业' : '创建第 ' + slotNo + ' 槽 · 选择职业',
      w / 2, 64, 32, C.ink, 800, 'center');
    this.label(ctx, '职业决定基础数值、起始技能与 15 个职业技能；建槽后职业不可更改',
      w / 2, 94, 13, C.dim, 600, 'center');

    const rects = this.classRects(g);
    const mx = Input.mouse.x, my = Input.mouse.y;

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const def = CONTENT.classes[r.id];
      const hover = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
      const lift = hover ? -4 : 0;

      ctx.save();
      ctx.translate(0, lift);
      if (hover) {
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 28;
      }
      ctx.fillStyle = hover ? 'rgba(17,26,43,0.98)' : 'rgba(9,13,22,0.92)';
      ctx.strokeStyle = hover ? def.color : 'rgba(120,170,255,0.25)';
      ctx.lineWidth = hover ? 2 : 1.4;
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      const cx = r.x + r.w / 2;
      this.label(ctx, def.icon, cx, r.y + 58, 44, def.color, 700, 'center');
      this.label(ctx, def.name, cx, r.y + 104, 26, def.color, 800, 'center');
      this.label(ctx, def.role, cx, r.y + 132, 13, C.dim, 600, 'center');

      this.label(ctx, 'HP ' + def.hp + '    移速 ' + def.speed,
        cx, r.y + 166, 13, C.ink, 600, 'center');
      this.label(ctx, '护甲 ' + Math.round(def.armor * 100) + '%    伤害 ×' + def.dmgMul.toFixed(2),
        cx, r.y + 188, 12, 'rgba(210,225,255,0.75)', 500, 'center');
      this.label(ctx, '冷却 ×' + def.cdMul.toFixed(2) + '    拾取 ' + def.magnet,
        cx, r.y + 208, 12, 'rgba(210,225,255,0.6)', 500, 'center');

      const start = CONTENT.skills[def.startSkill];
      this.label(ctx, '起始技能', cx, r.y + 242, 11, C.dim, 600, 'center');
      this.skillIcon(ctx, def.startSkill, cx - 34, r.y + 266, 24, start.color, start.icon);
      this.label(ctx, start.name, cx + 12, r.y + 266, 14, start.color, 700, 'center');

      this.label(ctx, '15 个职业技能 · 单局最多装备 5 个',
        cx, r.y + 302, 12, 'rgba(200,220,255,0.55)', 500, 'center');

      ctx.restore();
    }

    // 难度
    this.drawDifficultyPills(g);

    this.label(ctx, '1 战士    2 法师    Tab 切换难度    Esc 返回' +
      (g.creatingSlot != null ? '存档槽' : ''),
      w / 2, h - 56, 13, C.dim, 600, 'center');
  },

  skinRects(g) {
    const { w, h } = g.view;
    const cw = Math.min(300, (w - 110) / 2);
    const top = 118;
    const bottomMax = h - 150;
    const ch = Math.min(410, Math.max(180, Math.min(h * 0.54, bottomMax - top)));
    const gap = 30;
    const total = cw * 2 + gap;
    const x0 = (w - total) / 2;
    const y = Math.max(top, Math.min(h / 2 - ch / 2 + 10, bottomMax - ch));
    return [
      { skin: 1, x: x0, y, w: cw, h: ch },
      { skin: 2, x: x0 + cw + gap, y, w: cw, h: ch }
    ];
  },

  drawSkinSelect(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;
    const cls = CONTENT.classes[g.selectedClass] || CONTENT.classes.warrior;
    const diff = CONTENT.difficulties[g.difficulty] || CONTENT.difficulties.normal;

    this.drawMenuBackdrop(g);

    this.label(ctx, g.creatingSlot == null ? '选择形象' : '创建第 ' + (g.creatingSlot + 1) + ' 槽 · 选择形象',
      w / 2, 64, 32, C.ink, 800, 'center');
    this.label(ctx, cls.icon + '  ' + cls.name + ' · ' + diff.name +
      ' · 每个职业有 2 种形象', w / 2, 94, 13, C.dim, 600, 'center');

    const rects = this.skinRects(g);
    const mx = Input.mouse.x, my = Input.mouse.y;

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const hover = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
      const lift = hover ? -4 : 0;

      ctx.save();
      ctx.translate(0, lift);
      if (hover) {
        ctx.shadowColor = cls.color;
        ctx.shadowBlur = 28;
      }
      ctx.fillStyle = hover ? 'rgba(17,26,43,0.98)' : 'rgba(9,13,22,0.92)';
      ctx.strokeStyle = hover ? cls.color : 'rgba(120,170,255,0.25)';
      ctx.lineWidth = hover ? 2 : 1.4;
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      const cx = r.x + r.w / 2;
      const pw = Math.min(r.w - 44, r.h - 146);
      const py = r.y + 26;
      const pcy = py + pw / 2;

      // 有 PNG 就显示角色图; 没有就画一个带编号的占位框
      let drawn = false;
      if (pw > 20) {
        const ph = g.time * 1.6 + i * 1.9;
        const bob = Math.sin(ph * 1.7) * 3.2;
        const sway = Math.sin(ph) * 0.022;
        ctx.save();
        ctx.translate(cx, pcy + bob);
        ctx.rotate(sway);
        ctx.scale(1, 1 + Math.sin(ph * 1.7) * 0.012);
        drawn = Assets.draw(ctx, 'player', cls.id + '_' + r.skin, 0, 0, pw, pw, {
          time: g.time
        });
        ctx.restore();
      }
      if (!drawn) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        ctx.strokeStyle = 'rgba(150,190,255,0.22)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 6]);
        roundRect(ctx, cx - pw / 2, py, pw, pw, 18);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        const grad = ctx.createRadialGradient(cx, pcy, 4, cx, pcy, pw * 0.55);
        grad.addColorStop(0, 'rgba(255,255,255,0.10)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - pw / 2, py, pw, pw);
        this.label(ctx, cls.icon, cx, pcy - pw * 0.08, pw * 0.22, cls.color, 700, 'center');
        this.label(ctx, String(r.skin), cx, pcy + pw * 0.25, pw * 0.16,
          'rgba(232,240,255,0.55)', 800, 'center');
        ctx.restore();
      }

      this.label(ctx, '形象 ' + r.skin, cx, r.y + r.h - 56, 20, cls.color, 800, 'center');
      ctx.restore();
    }

    this.drawDifficultyPills(g);

    this.label(ctx, '1 / 2 ' + (g.creatingSlot == null ? '选择形象' : '创建并进入天赋树') +
      '    Tab 切换难度    Esc 返回', w / 2, h - 56, 13, C.dim, 600, 'center');
  },

  /* ---------------- 存档槽 ---------------- */
  slotRects(g) {
    const { w, h } = g.view;
    const gap = 20;
    const cw = Math.min(320, (w - 120 - gap * 2) / 3);
    const ch = Math.min(392, Math.max(280, h - 200));
    const total = cw * 3 + gap * 2;
    const x0 = (w - total) / 2;
    const y = Math.max(100, h / 2 - ch / 2 + 16);
    const out = [];
    for (let i = 0; i < 3; i++) {
      const card = { index: i, x: x0 + i * (cw + gap), y, w: cw, h: ch, empty: !g.slotAt(i) };
      if (!card.empty) {
        card.del = { x: card.x + card.w - 56, y: card.y + 12, w: 44, h: 24 };
      }
      out.push(card);
    }
    return out;
  },

  drawSlots(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;
    this.drawMenuBackdrop(g);

    this.label(ctx, '选择存档', w / 2, 62, 32, C.ink, 800, 'center');
    this.label(ctx, '3 个槽位 · 每槽绑定职业 · 天赋、金币与记录独立保存',
      w / 2, 92, 13, C.dim, 600, 'center');

    const rects = this.slotRects(g);
    const mx = Input.mouse.x, my = Input.mouse.y;

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const slot = g.slotAt(i);
      const hover = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
      const lift = hover ? -4 : 0;
      const classDef = slot ? CONTENT.classes[slot.classId] : null;
      const active = g.active === i;

      ctx.save();
      ctx.translate(0, lift);
      if (hover && classDef) {
        ctx.shadowColor = classDef.color;
        ctx.shadowBlur = 24;
      }
      ctx.fillStyle = hover ? 'rgba(17,26,43,0.98)' : 'rgba(9,13,22,0.92)';
      ctx.strokeStyle = active ? 'rgba(255,209,102,0.9)' :
        (hover ? (classDef ? classDef.color : 'rgba(160,200,255,0.7)') : 'rgba(120,170,255,0.24)');
      ctx.lineWidth = active ? 2 : 1.4;
      if (!slot) ctx.setLineDash([7, 7]);
      roundRect(ctx, r.x, r.y, r.w, r.h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      const cx = r.x + r.w / 2;
      const k = r.h / 392;
      const sy = v => r.y + v * k;

      if (!slot) {
        ctx.fillStyle = 'rgba(120,170,255,0.10)';
        ctx.beginPath();
        ctx.arc(cx, sy(118), 38 * Math.min(1, k), 0, TAU);
        ctx.fill();
        this.label(ctx, '+', cx, sy(114), 46 * Math.min(1, k), 'rgba(160,200,255,0.8)', 400, 'center');
        this.label(ctx, '空槽位', cx, sy(188), 22, 'rgba(210,225,255,0.75)', 700, 'center');
        this.label(ctx, '第 ' + (i + 1) + ' 槽', cx, sy(218), 12, C.dim, 600, 'center');
        this.label(ctx, '点击选择职业创建', cx, sy(266), 12, 'rgba(160,200,255,0.6)', 500, 'center');
      } else {
        // 当前槽标记
        if (active) {
          ctx.fillStyle = 'rgba(255,209,102,0.16)';
          ctx.strokeStyle = 'rgba(255,209,102,0.55)';
          ctx.lineWidth = 1;
          roundRect(ctx, r.x + 12, r.y + 12, 46, 22, 11);
          ctx.fill();
          ctx.stroke();
          this.label(ctx, '当前', r.x + 35, r.y + 23, 10, C.gold, 700, 'center');
        } else {
          this.label(ctx, '第 ' + (i + 1) + ' 槽', r.x + 14, r.y + 24, 11, C.dim, 600);
        }

        this.label(ctx, classDef.icon, cx, sy(70), 34, classDef.color, 700, 'center');
        this.label(ctx, classDef.name, cx, sy(102), 22, classDef.color, 800, 'center');
        this.label(ctx, '形象 ' + slot.skin + ' · ' + (slot.difficulty === 'hardcore' ? '硬核' : '正常'),
          cx, sy(126), 11, C.dim, 600, 'center');

        ctx.fillStyle = 'rgba(255,209,102,0.10)';
        roundRect(ctx, r.x + 16, sy(142), r.w - 32, 30 * Math.min(1, k), 8);
        ctx.fill();
        this.goldLabel(ctx, slot.gold, r.x + 28, sy(157), 16, C.gold, 800, 'left');
        this.label(ctx, '天赋 ' + Talents.totalRanks(slot) + ' / ' + Talents.maxRanks(slot.classId),
          r.x + r.w - 28, sy(157), 11, 'rgba(232,240,255,0.8)', 600, 'right');

        const bon = Talents.bonuses(slot.classId, slot.talents);
        const bits = [];
        if (bon.hpPct) bits.push('生命 +' + Math.round(bon.hpPct * 100) + '%');
        if (bon.dmgPct) bits.push('伤害 +' + Math.round(bon.dmgPct * 100) + '%');
        if (bon.cdrPct) bits.push('冷却 -' + Math.round(bon.cdrPct * 100) + '%');
        if (bon.armorAdd) bits.push('护甲 +' + Math.round(bon.armorAdd * 100) + '%');
        if (bon.speedAdd) bits.push('移速 +' + Math.round(bon.speedAdd));
        const ero = Talents.erosion(Talents.totalRanks(slot));
        this.label(ctx, bits.length ? bits.slice(0, 2).join('  ·  ') : '尚无永久加成',
          cx, sy(190), 10, 'rgba(190,215,245,0.7)', 500, 'center');
        this.label(ctx, '侵蚀 ' + ero.stacks + ' 层', cx, sy(208), 10,
          ero.stacks ? 'rgba(255,150,120,0.8)' : 'rgba(160,190,230,0.45)', 600, 'center');

        const n = slot.stats.normal, hc = slot.stats.hardcore;
        this.label(ctx, '正常  ' + (n.time ? fmtTime(n.time) + ' · ' + n.kills + ' 击杀' : '—'),
          cx, sy(240), 11, 'rgba(255,209,102,0.78)', 600, 'center');
        this.label(ctx, '硬核  ' + (hc.time ? fmtTime(hc.time) + ' · ' + hc.kills + ' 击杀' : '—'),
          cx, sy(260), 11, 'rgba(255,107,139,0.82)', 600, 'center');
        this.label(ctx, lastPlayedText(slot.lastPlayed), cx, sy(288), 10, C.dim, 500, 'center');
        this.label(ctx, hover ? '点击进入天赋树' : '点击进入', cx, r.y + r.h - 20, 12,
          hover ? classDef.color : 'rgba(160,200,255,0.6)', 600, 'center');

        if (r.del) {
          const confirm = g.slotDelete && g.slotDelete.index === i && g.slotDelete.t > 0;
          ctx.fillStyle = confirm ? 'rgba(255,60,100,0.25)' : 'rgba(255,255,255,0.05)';
          ctx.strokeStyle = confirm ? 'rgba(255,107,139,0.9)' : 'rgba(160,190,230,0.22)';
          ctx.lineWidth = 1;
          roundRect(ctx, r.del.x, r.del.y, r.del.w, r.del.h, 11);
          ctx.fill();
          ctx.stroke();
          this.label(ctx, confirm ? '确认?' : '删除', r.del.x + r.del.w / 2, r.del.y + r.del.h / 2,
            10, confirm ? '#ff9db2' : 'rgba(200,215,240,0.55)', 600, 'center');
        }
      }
      ctx.restore();
    }

    this.label(ctx, '1 / 2 / 3 选择槽位    Esc 返回标题', w / 2, h - 54, 13, C.dim, 600, 'center');
  },

  /* ---------------- 天赋树 ---------------- */
  talentGeometry(g) {
    const { w, h } = g.view;
    const top = 78;
    const bottom = 74;
    const R = Math.max(150, Math.min((w - 300) / 2, (h - top - bottom) / 2 - 6));
    return { cx: w / 2, cy: top + (h - top - bottom) / 2, R: R };
  },

  talentNodeR(g) {
    return clamp(this.talentGeometry(g).R * 0.058, 12, 19);
  },

  talentLayout(g) {
    const slot = g.activeSlot();
    if (!slot) return [];
    const q = this.talentGeometry(g);
    return Talents.layout(slot.classId, q.cx, q.cy, q.R);
  },

  talentButtons(g) {
    const { w, h } = g.view;
    const y = h - 62;
    const compact = w < 760;
    const sw = compact ? 150 : 210;
    const bw = compact ? 86 : 110;
    const rw = compact ? 100 : 150;
    const dw = 92, dh = 28, dg = 8;
    const dx = w / 2 - (dw * 2 + dg) / 2;
    return {
      start: { x: w / 2 - sw / 2, y: y, w: sw, h: 44 },
      back: { x: compact ? 16 : 24, y: y, w: bw, h: 44 },
      respec: { x: w - rw - (compact ? 16 : 24), y: y, w: rw, h: 44 },
      skin: { x: w - 142, y: 70, w: 118, h: 26 },
      diff: [
        { id: 'normal', x: dx, y: 18, w: dw, h: dh },
        { id: 'hardcore', x: dx + dw + dg, y: 18, w: dw, h: dh }
      ]
    };
  },

  talentHit(g, mx, my) {
    const list = this.talentLayout(g);
    const r = this.talentNodeR(g) * 1.36;
    let best = null, bestD = r * r;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const dx = mx - p.x, dy = my - p.y;
      const d = dx * dx + dy * dy;
      if (d <= bestD) { bestD = d; best = p; }
    }
    return best;
  },

  /* 天赋页左侧信息卡的纵向布局（相对 py 的偏移）。
     属性条目数是变量，所有位置都必须由它推导；写死底边会和最后一行叠字。 */
  talentSideLayout(branchCount, attrCount) {
    const branchTop = 38;
    const rowH = 18;
    const attrRowH = 16;
    const divY = branchTop + branchCount * rowH + 2;
    const attrTitleY = divY + 17;
    const attrTop = attrTitleY + 17;
    const rows = Math.max(1, attrCount);
    const eroY = attrTop + rows * attrRowH + 4;
    return {
      branchTop, divY, attrTitleY, attrTop, attrRowH, eroY,
      ph: eroY + 14,
      attrBottom: attrTop + (rows - 1) * attrRowH
    };
  },

  drawTalent(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;
    const slot = g.activeSlot();
    if (!slot) return;
    const cls = CONTENT.classes[slot.classId] || CONTENT.classes.warrior;
    const q = this.talentGeometry(g);
    const nodeR = this.talentNodeR(g);
    const bonuses = Talents.bonuses(slot.classId, slot.talents);
    const total = Talents.totalRanks(slot);
    const maxRanks = Talents.maxRanks(slot.classId);
    const mx = Input.mouse.x, my = Input.mouse.y;
    const hover = this.talentHit(g, mx, my);

    this.drawMenuBackdrop(g);

    // 三个扇区
    const branches = Talents.branches(slot.classId);
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      const a0 = b.angle - Math.PI / 3 + 0.035;
      const a1 = b.angle + Math.PI / 3 - 0.035;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(q.cx, q.cy);
      ctx.arc(q.cx, q.cy, q.R * 0.99, a0, a1);
      ctx.closePath();
      ctx.fillStyle = b.color + '0b';
      ctx.fill();
      ctx.strokeStyle = b.color + '26';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // 分支中线
      ctx.strokeStyle = b.color + '22';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(q.cx + Math.cos(b.angle) * q.R * 0.18, q.cy + Math.sin(b.angle) * q.R * 0.18);
      ctx.lineTo(q.cx + Math.cos(b.angle) * q.R * 0.96, q.cy + Math.sin(b.angle) * q.R * 0.96);
      ctx.stroke();
    }

    // 环
    ctx.save();
    ctx.setLineDash([3, 8]);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = 'rgba(140,180,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(q.cx, q.cy, q.R * [0.18, 0.33, 0.48, 0.63, 0.79, 0.96][i], 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    const layout = this.talentLayout(g);
    const byId = Object.create(null);
    for (let i = 0; i < layout.length; i++) byId[layout[i].node.id] = layout[i];

    // 连线
    for (let i = 0; i < layout.length; i++) {
      const p = layout[i];
      const n = p.node;
      const rank = Talents.rank(slot, n.id);
      for (let k = 0; k < n.req.length; k++) {
        const parent = byId[n.req[k]];
        if (!parent) continue;
        ctx.strokeStyle = rank > 0 ? n.branchColor + '66' : 'rgba(120,150,190,0.18)';
        ctx.lineWidth = rank > 0 ? 2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(parent.x, parent.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    // 圆心（先画，让 1 环核心节点盖在它上面）
    const hubR = Math.min(44, q.R * 0.17);
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,0.95)';
    ctx.strokeStyle = cls.color + '88';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = cls.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(q.cx, q.cy, hubR, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    this.label(ctx, cls.icon, q.cx, q.cy - 7, hubR * 0.48, cls.color, 700, 'center');
    this.label(ctx, total + ' / ' + maxRanks, q.cx, q.cy + hubR * 0.48, 10,
      'rgba(210,225,255,0.72)', 600, 'center');
    ctx.restore();

    // 节点
    for (let i = 0; i < layout.length; i++) {
      const p = layout[i];
      const n = p.node;
      const rank = Talents.rank(slot, n.id);
      const max = n.cost.length;
      const can = Talents.canBuy(slot, n);
      const maxed = rank >= max;
      const locked = can.reason === 'req';
      const affordable = can.ok;
      const openNode = can.reason !== 'req' && can.reason !== 'none';
      const isHover = hover && hover.node.id === n.id;
      const col = n.branchColor;
      const icon = Talents.iconAsset(n);
      const tile = nodeR * 1.92 * (isHover ? 1.12 : 1);

      this.iconTile(ctx, p.x, p.y, tile, {
        color: rank > 0 ? col : (openNode ? col + 'aa' : 'rgba(120,150,190,0.5)'),
        iconCat: icon ? icon.cat : null,
        iconKey: icon ? icon.key : null,
        glyph: n.icon || n.name.slice(0, 1),
        maxed: maxed,
        locked: locked,
        alpha: locked ? 0.5 : 1,
        glow: (isHover || affordable) ? (isHover ? 20 : 10) : 0,
        glowColor: maxed ? '#ffd166' : col,
        time: g.time
      });

      // 等级点
      const py = nodeR * 1.10;
      const step = 5;
      const start = -(max - 1) * step / 2;
      for (let k = 0; k < max; k++) {
        ctx.fillStyle = k < rank ? (maxed ? '#ffd166' : col) : 'rgba(200,220,255,0.18)';
        ctx.beginPath();
        ctx.arc(p.x + start + k * step, p.y + py, 1.8, 0, TAU);
        ctx.fill();
      }
    }

    // 顶栏
    this.label(ctx, cls.icon + '  ' + cls.name, 24, 26, 18, cls.color, 800);
    this.label(ctx, '第 ' + (g.active + 1) + ' 槽 · 形象 ' + slot.skin,
      24, 48, 11, C.dim, 600);

    ctx.save();
    ctx.shadowColor = 'rgba(255,183,3,0.4)';
    ctx.shadowBlur = 8;
    this.goldLabel(ctx, slot.gold, w - 24, 26, 18, C.gold, 800, 'right');
    ctx.restore();
    const ero = g.erosionOff ? { stacks: 0 } : Talents.erosion(total);
    this.label(ctx, '深渊侵蚀 ' + ero.stacks + ' 层', w - 24, 48, 11,
      ero.stacks ? 'rgba(255,150,120,0.85)' : 'rgba(160,190,230,0.5)', 600, 'right');

    // 难度胶囊
    const btns = this.talentButtons(g);
    for (let i = 0; i < btns.diff.length; i++) {
      const r = btns.diff[i];
      const def = CONTENT.difficulties[r.id];
      const on = slot.difficulty === r.id;
      const hov = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
      ctx.fillStyle = on ? 'rgba(20,34,54,0.98)' : 'rgba(9,13,22,0.8)';
      ctx.strokeStyle = on ? def.color : (hov ? 'rgba(160,200,255,0.6)' : 'rgba(120,170,255,0.22)');
      ctx.lineWidth = on ? 1.8 : 1;
      roundRect(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fill();
      ctx.stroke();
      this.label(ctx, def.name, r.x + r.w / 2, r.y + r.h / 2, 11,
        on ? def.color : C.dim, 700, 'center');
    }

    // 形象按钮
    const skinBtn = btns.skin;
    const skinHover = mx >= skinBtn.x && mx <= skinBtn.x + skinBtn.w &&
      my >= skinBtn.y && my <= skinBtn.y + skinBtn.h;
    ctx.fillStyle = skinHover ? 'rgba(20,34,54,0.98)' : 'rgba(9,13,22,0.8)';
    ctx.strokeStyle = skinHover ? cls.color : 'rgba(120,170,255,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, skinBtn.x, skinBtn.y, skinBtn.w, skinBtn.h, 12);
    ctx.fill();
    ctx.stroke();
    this.label(ctx, '形象 ' + slot.skin + ' ⇄', skinBtn.x + skinBtn.w / 2,
      skinBtn.y + skinBtn.h / 2, 10, skinHover ? cls.color : C.dim, 600, 'center');

    // 左侧：分支进度 + 永久属性 + 敌人侵蚀
    // 布局用「游标」推进而不是写死底边：属性条目数一变，卡片高度和最后两行会自动跟着走，
    // 不会再把「敌人 +N% 生命」压在最后一条属性上（旧版固定 py+ph-12，正好压在属性行基线下方 2px）。
    const px = 24, py = 84, pw = 218;
    const attr = [];
    if (bonuses.hpPct) attr.push('生命 +' + Math.round(bonuses.hpPct * 100) + '%');
    if (bonuses.dmgPct) attr.push('伤害 +' + Math.round(bonuses.dmgPct * 100) + '%');
    if (bonuses.cdrPct) attr.push('冷却 -' + Math.round(bonuses.cdrPct * 100) + '%');
    if (bonuses.armorAdd) attr.push('护甲 +' + Math.round(bonuses.armorAdd * 100) + '%');
    if (bonuses.speedAdd) attr.push('移速 +' + Math.round(bonuses.speedAdd));
    if (bonuses.regenAdd) attr.push('回复 +' + (Math.round(bonuses.regenAdd * 10) / 10) + '/s');
    if (bonuses.areaPct) attr.push('范围 +' + Math.round(bonuses.areaPct * 100) + '%');
    if (bonuses.onKill) attr.push('击杀加速 +' + Math.round((bonuses.onKill.mul - 1) * 100) + '%');

    const side = this.talentSideLayout(branches.length, attr.length);
    const branchTop = side.branchTop;
    const divY = side.divY;
    const attrTitleY = side.attrTitleY;
    const attrTop = side.attrTop;
    const eroY = side.eroY;
    const ph = side.ph;

    if (w >= 1000) {
      ctx.fillStyle = 'rgba(9,13,22,0.82)';
      ctx.strokeStyle = 'rgba(120,170,255,0.18)';
      ctx.lineWidth = 1;
      roundRect(ctx, px, py, pw, ph, 12);
      ctx.fill();
      ctx.stroke();

      this.label(ctx, '天赋进度', px + 12, py + 18, 11, C.dim, 700);
      let rowY = py + branchTop;
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        const prog = Talents.branchProgress(slot, b);
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(px + 18, rowY, 3.2, 0, TAU);
        ctx.fill();
        this.label(ctx, b.name, px + 28, rowY, 11, 'rgba(225,235,255,0.85)', 600);
        this.label(ctx, prog.rank + ' / ' + prog.max, px + pw - 12, rowY, 10, C.dim, 600, 'right');
        rowY += 18;
      }

      ctx.strokeStyle = 'rgba(120,170,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(px + 12, py + divY);
      ctx.lineTo(px + pw - 12, py + divY);
      ctx.stroke();

      this.label(ctx, '永久属性', px + 12, py + attrTitleY, 11, C.dim, 700);
      let ay = py + attrTop;
      if (!attr.length) {
        this.label(ctx, '尚未点亮天赋', px + 12, ay, 10, 'rgba(170,195,225,0.5)', 500);
      } else {
        for (let i = 0; i < attr.length; i++) {
          this.label(ctx, attr[i], px + 12, ay, 10, 'rgba(215,230,250,0.78)', 500);
          ay += 16;
        }
      }

      // 敌人加强信息：紧跟属性块，并与上方留 4px 呼吸位
      ctx.strokeStyle = 'rgba(255,150,120,0.14)';
      ctx.beginPath();
      ctx.moveTo(px + 12, py + eroY - 9);
      ctx.lineTo(px + pw - 12, py + eroY - 9);
      ctx.stroke();
      this.label(ctx, '敌人 +' + Math.round((ero.hp - 1) * 100) + '% 生命 / +' +
        Math.round((ero.dmg - 1) * 100) + '% 伤害', px + 12, py + eroY, 9,
        'rgba(255,150,120,0.7)', 500);
    }

    // 底栏按钮
    const start = btns.start;
    const startHover = mx >= start.x && mx <= start.x + start.w &&
      my >= start.y && my <= start.y + start.h;
    ctx.save();
    if (startHover) { ctx.shadowColor = cls.color; ctx.shadowBlur = 18; }
    ctx.fillStyle = startHover ? 'rgba(22,40,62,0.98)' : 'rgba(14,24,40,0.92)';
    ctx.strokeStyle = startHover ? cls.color : 'rgba(160,200,255,0.4)';
    ctx.lineWidth = startHover ? 2 : 1.2;
    roundRect(ctx, start.x, start.y, start.w, start.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    this.label(ctx, '开始挑战  Enter', start.x + start.w / 2, start.y + start.h / 2,
      15, startHover ? cls.color : C.ink, 700, 'center');
    ctx.restore();

    const back = btns.back;
    const backHover = mx >= back.x && mx <= back.x + back.w &&
      my >= back.y && my <= back.y + back.h;
    ctx.fillStyle = backHover ? 'rgba(20,34,54,0.98)' : 'rgba(9,13,22,0.8)';
    ctx.strokeStyle = backHover ? 'rgba(160,200,255,0.7)' : 'rgba(120,170,255,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, back.x, back.y, back.w, back.h, 12);
    ctx.fill();
    ctx.stroke();
    this.label(ctx, '返回  Esc', back.x + back.w / 2, back.y + back.h / 2,
      11, backHover ? C.ink : C.dim, 600, 'center');

    const rs = btns.respec;
    const rsHover = mx >= rs.x && mx <= rs.x + rs.w &&
      my >= rs.y && my <= rs.y + rs.h;
    const confirm = g.respecConfirmT > 0;
    ctx.fillStyle = confirm ? 'rgba(80,30,40,0.9)' : (rsHover ? 'rgba(20,34,54,0.98)' : 'rgba(9,13,22,0.8)');
    ctx.strokeStyle = confirm ? 'rgba(255,107,139,0.8)' :
      (rsHover ? 'rgba(160,200,255,0.7)' : 'rgba(120,170,255,0.22)');
    ctx.lineWidth = confirm ? 1.6 : 1;
    roundRect(ctx, rs.x, rs.y, rs.w, rs.h, 12);
    ctx.fill();
    ctx.stroke();
    this.label(ctx, confirm ? '确认洗点?' : '洗点  R', rs.x + rs.w / 2, rs.y + rs.h / 2,
      11, confirm ? '#ff9db2' : (rsHover ? C.ink : C.dim), 600, 'center');

    // 提示 / 操作反馈
    this.label(ctx, '点击节点升级 · 悬停查看 · Tab 切换难度', w / 2, h - 74, 10,
      'rgba(180,205,240,0.5)', 500, 'center');
    if (g.talentToastT > 0) {
      ctx.globalAlpha = clamp(g.talentToastT, 0, 1);
      this.label(ctx, g.talentToast, w / 2, h - 104, 12, C.gold, 700, 'center');
      ctx.globalAlpha = 1;
    }

    // 悬停提示最后画, 盖住节点
    if (hover) this.drawTalentTooltip(g, hover, mx, my);
  },

  drawTalentTooltip(g, hit, mx, my) {
    const ctx = g.ctx;
    const slot = g.activeSlot();
    if (!slot) return;
    const n = hit.node;
    const rank = Talents.rank(slot, n.id);
    const max = n.cost.length;
    const can = Talents.canBuy(slot, n);
    const next = rank < max ? Talents.nextCost(n, rank) : 0;

    const tw = 304;
    ctx.font = font(12, 500);
    const cur = rank > 0 ? Talents.effectText(n, rank) : '未点亮';
    const nxt = rank < max ? Talents.effectText(n, rank + 1) : '已满级';
    const curLines = wrapText(ctx, cur, tw - 28);
    const nxtLines = rank < max ? wrapText(ctx, nxt, tw - 28) : [];

    let reqText = '';
    if (can.reason === 'req') {
      const names = can.missing.map(id => {
        const r = Talents.node(slot.classId, id);
        return r ? r.name : id;
      });
      reqText = '需要：' + names.join(' / ') + ' ' + can.needRank + ' 级';
    } else if (can.reason === 'max') {
      reqText = '已满级';
    } else if (can.reason === 'gold') {
      reqText = '金币不足，还差 ' + can.need;
    } else {
      reqText = '前置已满足';
    }
    const reqLines = wrapText(ctx, reqText, tw - 28);

    const th = 22 + 18 + 14 + curLines.length * 17 + 8 +
      (nxtLines.length ? 14 + nxtLines.length * 17 + 8 : 0) +
      18 + reqLines.length * 16 + 16;

    let x = mx + 18;
    let y = my + 16;
    if (x + tw > g.view.w - 12) x = mx - tw - 18;
    if (y + th > g.view.h - 12) y = g.view.h - th - 12;
    x = Math.max(12, x);
    y = Math.max(12, y);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(7,11,20,0.97)';
    ctx.strokeStyle = n.branchColor;
    ctx.lineWidth = 1.4;
    roundRect(ctx, x, y, tw, th, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    this.label(ctx, n.name, x + 14, y + 18, 14, n.branchColor, 800);
    this.label(ctx, 'Lv ' + rank + ' / ' + max, x + tw - 14, y + 18, 10, C.dim, 600, 'right');
    this.label(ctx, n.branchName + '系 · ' + (n.type === 'keystone' ? '终极' : '天赋'),
      x + 14, y + 38, 10, 'rgba(180,205,240,0.55)', 600);

    let ly = y + 56;
    this.label(ctx, '当前', x + 14, ly, 10, C.dim, 600);
    ly += 14;
    for (let i = 0; i < curLines.length; i++) {
      this.label(ctx, curLines[i], x + 14, ly, 11, rank > 0 ? C.ink : 'rgba(180,200,225,0.5)', 500);
      ly += 17;
    }

    if (nxtLines.length) {
      this.label(ctx, '下一级', x + 14, ly + 2, 10, 'rgba(126,224,160,0.8)', 600);
      ly += 18;
      for (let i = 0; i < nxtLines.length; i++) {
        this.label(ctx, nxtLines[i], x + 14, ly, 11, 'rgba(126,224,160,0.9)', 500);
        ly += 17;
      }
      ly += 6;
    }

    if (rank < max) {
      this.label(ctx, '费用 ' + next + ' 金', x + 14, ly + 8, 12,
        (slot.gold || 0) >= next ? C.gold : '#ff9db2', 700);
      ly += 24;
    }

    for (let i = 0; i < reqLines.length; i++) {
      this.label(ctx, reqLines[i], x + 14, ly + 6, 10,
        can.reason === 'req' || can.reason === 'gold' ? 'rgba(255,157,178,0.9)' : 'rgba(160,200,235,0.6)', 500);
      ly += 16;
    }

    this.label(ctx, can.ok ? '点击升级' : (can.reason === 'max' ? '已满级' : '暂不可购买'),
      x + tw - 14, y + th - 12, 9, can.ok ? 'rgba(160,255,200,0.8)' : 'rgba(180,200,225,0.4)', 600, 'right');
    ctx.restore();
  },

  /* ---------------- 标题 ---------------- */
  drawTitle(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;

    // 星空
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < g.stars.length; i++) {
      const s = g.stars[i];
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(g.time * s.sp + s.ph));
      ctx.globalAlpha = tw * s.a;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // 光晕
    const grad = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, h * 0.7);
    grad.addColorStop(0, 'rgba(60,140,255,0.16)');
    grad.addColorStop(1, 'rgba(5,6,10,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.shadowColor = '#63e6ff';
    ctx.shadowBlur = 30;
    this.label(ctx, CONTENT.title, w / 2, h * 0.36, Math.min(78, w / 9), '#eaf6ff', 800, 'center');
    ctx.restore();

    this.label(ctx, CONTENT.subtitle, w / 2, h * 0.36 + 58, 14, 'rgba(160,200,255,0.6)', 600, 'center');
    ctx.font = font(14, 600);
    const subW = ctx.measureText(CONTENT.subtitle).width;
    ctx.strokeStyle = 'rgba(99,230,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - subW / 2 - 40, h * 0.36 + 58);
    ctx.lineTo(w / 2 - subW / 2 - 12, h * 0.36 + 58);
    ctx.moveTo(w / 2 + subW / 2 + 12, h * 0.36 + 58);
    ctx.lineTo(w / 2 + subW / 2 + 40, h * 0.36 + 58);
    ctx.stroke();

    // 开始提示
    const pulse = 0.6 + 0.4 * Math.sin(g.time * 3.2);
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    this.label(ctx, '按 空格 / 点击 选择存档', w / 2, h * 0.58, 20, '#63e6ff', 700, 'center');
    ctx.globalAlpha = 1;

    // 当前槽摘要
    const slot = g.activeSlot();
    if (slot) {
      const cls = CONTENT.classes[slot.classId] || CONTENT.classes.warrior;
      this.label(ctx, cls.icon + '  ' + cls.name +
        '  ·  天赋 ' + Talents.totalRanks(slot) + ' / ' + Talents.maxRanks(slot.classId) +
        '  ·  第 ' + (g.active + 1) + ' 槽',
        w / 2, h * 0.64, 13, 'rgba(210,225,255,0.7)', 600, 'center');
      this.goldLabel(ctx, slot.gold, w / 2, h * 0.64 + 21, 12, C.gold, 700, 'center');
    } else {
      this.label(ctx, '3 个空槽位 · 选择职业开始第一段旅程',
        w / 2, h * 0.64, 13, 'rgba(180,205,240,0.5)', 500, 'center');
    }

    // 最佳记录
    const n = g.bestOf('normal');
    const hc = g.bestOf('hardcore');
    if (n.time > 0 || hc.time > 0) {
      const y = h * 0.70;
      if (n.time > 0) {
        this.label(ctx, '正常最佳  ' + fmtTime(n.time) + '  ·  ' + n.kills + ' 击杀  ·  Lv ' + n.level,
          w / 2, y, 12, 'rgba(255,209,102,0.78)', 600, 'center');
      }
      if (hc.time > 0) {
        this.label(ctx, '硬核最佳  ' + fmtTime(hc.time) + '  ·  ' + hc.kills + ' 击杀  ·  Lv ' + hc.level,
          w / 2, y + 22, 12, 'rgba(255,107,139,0.85)', 600, 'center');
      }
    }

    // 操作说明
    const lines = [
      'WASD / 方向键  移动（技能全自动）',
      '升级时 1 / 2 / 3 或点击选择',
      'P 暂停    M 静音'
    ];
    for (let i = 0; i < lines.length; i++) {
      this.label(ctx, lines[i], w / 2, h * 0.80 + i * 22, 12, 'rgba(180,205,240,0.55)', 500, 'center');
    }

    this.label(ctx, 'v' + CONTENT.version, 16, h - 16, 11, 'rgba(255,255,255,0.22)', 500, 'left');
  },

  /* ---------------- 暂停 / 结算 ---------------- */
  drawPause(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;
    ctx.fillStyle = 'rgba(3,5,10,0.66)';
    ctx.fillRect(0, 0, w, h);
    this.label(ctx, '暂停', w / 2, h / 2 - 20, 40, '#eaf6ff', 800, 'center');
    this.label(ctx, '按 P 继续', w / 2, h / 2 + 26, 14, C.dim, 600, 'center');
  },

  drawEnd(g) {
    const ctx = g.ctx;
    const { w, h } = g.view;
    const win = g.state === 'win';
    const cls = CONTENT.classes[g.player.classId] || CONTENT.classes.warrior;
    const best = g.bestOf(g.difficulty);

    ctx.fillStyle = 'rgba(3,5,10,0.78)';
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(w / 2, h * 0.4, 5, w / 2, h * 0.4, h * 0.6);
    grad.addColorStop(0, win ? 'rgba(99,230,255,0.18)' : 'rgba(255,60,100,0.14)');
    grad.addColorStop(1, 'rgba(5,6,10,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.shadowColor = win ? '#63e6ff' : '#ff5c7a';
    ctx.shadowBlur = 26;
    this.label(ctx, win ? '深渊已被净化' : '你倒下了', w / 2, h * 0.28, 46, win ? '#eaf6ff' : '#ffd6de', 800, 'center');
    ctx.restore();

    this.label(ctx, cls.name + '  ·  ' + g.mods.name, w / 2, h * 0.35, 14, cls.color, 700, 'center');

    const stats = [
      ['存活时间', fmtTime(g.t)],
      ['等级', 'Lv ' + g.player.level],
      ['击杀', String(g.kills)],
      ['威胁等级', String(g.threat || 1) + ' · ' + CONTENT.threat.names[(g.threat || 1) - 1]],
      ['总伤害', Math.round(g.player.damageDealt).toLocaleString()]
    ];
    if (g.runMode === 'slot') {
      stats.push(['本局金币', '+' + fmtGold(g.lastGoldGain || 0)]);
      stats.push(['金币总计', g.activeSlot() ? fmtGold(g.activeSlot().gold) : '—']);
    }
    const rowH = h < 560 ? 26 : 34;
    const boxW = 320;
    const bx = w / 2 - boxW / 2;
    let by = h * 0.41;
    for (let i = 0; i < stats.length; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0)';
      roundRect(ctx, bx, by, boxW, rowH, 6);
      ctx.fill();
      this.label(ctx, stats[i][0], bx + 16, by + rowH / 2, 13, C.dim, 600);
      this.label(ctx, stats[i][1], bx + boxW - 16, by + rowH / 2, 15, C.ink, 700, 'right');
      by += rowH;
    }

    if (best.time > 0) {
      this.label(ctx, g.mods.name + '最佳  ' + fmtTime(best.time) + '  ·  ' +
        best.kills + ' 击杀  ·  Lv ' + best.level,
        w / 2, by + 18, 12, C.dim, 600, 'center');
      by += 24;
    }

    if (g.newRecord) {
      this.label(ctx, '★ 新纪录', w / 2, by + 18, 14, C.gold, 700, 'center');
      by += 14;
    }

    const pulse = 0.6 + 0.4 * Math.sin(g.time * 3.2);
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    const keys = g.runMode === 'slot'
      ? 'R 重开  ·  T 天赋树  ·  空格 返回存档'
      : 'R 重新开始  ·  空格 返回存档';
    const promptY = Math.min(h - 20, Math.max(h * 0.86, by + 34));
    this.label(ctx, keys, w / 2, promptY, 15, '#63e6ff', 700, 'center');
    ctx.globalAlpha = 1;
  }
};
