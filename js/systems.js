/* =========================================================
   深渊回响 — 系统: 技能行为 / 伤害 / 刷怪 / 升级卡池
   ========================================================= */

'use strict';

/* ---------------- 技能数值: 基础等级 + 天赋修正 ---------------- */
function skillStats(p, def, w) {
  const base = def.lvl[w.lvl - 1];
  const sid = w.id || def.id;
  const mod = p && p.skillMods ? p.skillMods[sid] : null;
  if (!mod) return base;

  const out = Object.assign({}, base);
  if (mod.dmg && base.dmg !== undefined) out.dmg = base.dmg * (1 + mod.dmg);
  if (mod.cd && base.cd !== undefined) out.cd = base.cd * (1 + mod.cd);
  if (mod.cd && base.recharge !== undefined) out.recharge = base.recharge * (1 + mod.cd);

  if (mod.area) {
    const fields = ['range', 'radius', 'aoe', 'castRange'];
    for (let i = 0; i < fields.length; i++) {
      const k = fields[i];
      if (base[k] !== undefined) out[k] = base[k] * (1 + mod.area);
    }
  }

  if (mod.duration && base.duration !== undefined) out.duration = base.duration * (1 + mod.duration);
  if (mod.shield && base.shield !== undefined) out.shield = base.shield * (1 + mod.shield);

  if (mod.buff) {
    if (base.dmgMul !== undefined) out.dmgMul = base.dmgMul * (1 + mod.buff);
    if (base.armor !== undefined) out.armor = base.armor * (1 + mod.buff);
  }

  if (mod.dot && base.dot) {
    out.dot = Object.assign({}, base.dot, { dps: base.dot.dps * (1 + mod.dot) });
  }

  if (mod.heal && base.healPct !== undefined) out.healPct = base.healPct * (1 + mod.heal);
  if (mod.knock && base.knock !== undefined) out.knock = base.knock * (1 + mod.knock);
  if (mod.slow && base.slow !== undefined) out.slow = clamp(base.slow + mod.slow, 0, 0.9);
  if (mod.vuln && base.vuln !== undefined) out.vuln = clamp(base.vuln + mod.vuln, 0, 1);

  if (mod.dist) {
    const fields = ['distance', 'minDist', 'maxDist'];
    for (let i = 0; i < fields.length; i++) {
      const k = fields[i];
      if (base[k] !== undefined) out[k] = base[k] * (1 + mod.dist);
    }
  }

  if (mod.internal && base.internalCd !== undefined) out.internalCd = base.internalCd * (1 + mod.internal);
  return out;
}

/* ---------------- 小工具 ---------------- */
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

function startCd(w, s, p) {
  w.t = (s.cd || 0) * p.cdMul;
}

function applyDot(e, dot, id, color) {
  if (!dot || !dot.dps) return;
  let d = null;
  for (let i = 0; i < e.dots.length; i++) if (e.dots[i].id === id) { d = e.dots[i]; break; }
  if (!d) {
    d = { id, dps: dot.dps, t: dot.t, tickT: 0, color: color || '#ff6b6b' };
    e.dots.push(d);
  } else {
    d.dps = Math.max(d.dps, dot.dps);
    d.t = Math.max(d.t, dot.t);
    d.tickT = Math.min(d.tickT, 0.25);
  }
}

function hitEnemy(g, w, s, e) {
  if (!e || e.dead) return;
  damageEnemy(g, e, s.dmg, {
    color: s.color,
    execute: s.execute,
    crit: s.crit
  });
  if (e.dead) return;

  if (s.dot) applyDot(e, s.dot, w.id, s.color);
  if (s.vuln) {
    e.vuln = Math.max(e.vuln, s.vuln);
    e.vulnT = Math.max(e.vulnT, s.vulnT || 0);
  }
  if (s.slow) {
    e.slow = Math.max(e.slow, s.slow);
    e.slowT = Math.max(e.slowT, s.slowT || 0);
  }
  if (s.knock && !e.boss) {
    const a = angTo(g.player.x, g.player.y, e.x, e.y);
    e.x += Math.cos(a) * s.knock;
    e.y += Math.sin(a) * s.knock;
  }
}

/* 找敌人密集处, 至少 2 个才施放地面 AOE */
function pickCluster(g, p, castRange, radius) {
  const list = g.nearestEnemies(p.x, p.y, castRange, 12);
  const near = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    let n = 0;
    g.grid.query(e.x, e.y, radius, near);
    for (let j = 0; j < near.length; j++) {
      const o = near[j];
      if (o.dead) continue;
      const rr = radius + o.r;
      if (dist2(e.x, e.y, o.x, o.y) <= rr * rr) n++;
    }
    if (n >= 2) return e;
  }
  return null;
}

/* 闪现: 16 个方向里挑一个离敌人最远的落点 */
function findBlinkSpot(g, p, distance) {
  const W = CONTENT.world;
  let bestX = p.x, bestY = p.y, bestScore = -1;
  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16;
    const x = clamp(p.x + Math.cos(a) * distance, p.r + 18, W.w - p.r - 18);
    const y = clamp(p.y + Math.sin(a) * distance, p.r + 18, W.h - p.r - 18);
    let score = 1e9;
    for (let j = 0; j < g.enemies.length; j++) {
      const e = g.enemies[j];
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < score) score = d;
    }
    if (score > bestScore) { bestScore = score; bestX = x; bestY = y; }
  }
  return { x: bestX, y: bestY };
}

/* ---------------- 技能行为模板 ---------------- */
const SKILL_BEHAVIORS = {
  /* 近战扇形 / 锥形 */
  strike: {
    tick(g, w, s, p, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const range = s.range * p.areaMul;
      const tgt = g.nearestTarget(p.x, p.y, range);
      if (!tgt) return;
      startCd(w, s, p);

      const def = CONTENT.skills[w.id] || {};
      const fx = def.fx || 'gold';
      const base = angTo(p.x, p.y, tgt.x, tgt.y);
      const half = (s.arc || 1.6) / 2;
      const isCone = w.id === 'dragon_breath' || w.id === 'cone_of_cold';
      const heavy = w.id === 'execute' || w.id === 'overpower' || w.id === 'shield_slam' || w.id === 'sunder_armor';

      if (isCone) {
        p.triggerAttack('cast', base, w.id, { style: fx, dur: w.id === 'dragon_breath' ? 0.62 : 0.38 });
        if (w.id === 'dragon_breath') {
          // 视觉范围比命中范围大一圈, 看起来更有压迫感
          VFX.breath(p.x, p.y, base, range * 1.38, (s.arc || 1.4) * 1.08, fx, def.color, {
            life: 0.82, groundLife: 1.15
          });
          VFX.shock(p.x + Math.cos(base) * 26, p.y + Math.sin(base) * 26,
            range * 0.52, 'dragon', def.color, { life: 0.42, heavy: true });
          VFX.dust(p.x, p.y, 'dragon', def.color, { life: 0.6 });
          g.cam.shake = Math.min(18, g.cam.shake + 5.5);
          Sfx.play('breath');
        } else {
          VFX.cone(p.x, p.y, base, range, s.arc || 1.4, fx, def.color, { life: 0.42 });
          Sfx.play('shoot');
        }
      } else {
        p.triggerAttack('strike', base, w.id, { style: fx, dur: heavy ? 0.36 : 0.3 });
        VFX.slash(p.x, p.y, base, range, s.arc || 1.6, fx, def.color, {
          heavy,
          life: heavy ? 0.34 : 0.27
        });
        if (heavy) {
          VFX.shock(p.x + Math.cos(base) * range * 0.55,
            p.y + Math.sin(base) * range * 0.55, range * 0.55, fx, def.color, {
              heavy: true, life: 0.32
            });
          // 重击落点: 小范围裂地 + 碎石, 让「砸下去」有重量
          VFX.slam(p.x + Math.cos(base) * range * 0.68,
            p.y + Math.sin(base) * range * 0.68, range * 0.52, fx, def.color,
            { debris: 10, crackLife: 0.85 });
          g.freeze(0.055);
        }
        if (w.id === 'rend') {
          // 撕裂: 三道错开的血爪
          for (let i = -1; i <= 1; i++) {
            VFX.slash(p.x, p.y, base + i * 0.16, range * (0.92 + i * 0.04),
              (s.arc || 2.1) * 0.42, fx, def.color, { life: 0.24 });
          }
        }
      }
      if (w.id !== 'dragon_breath') {
        g.cam.shake = Math.min(14, g.cam.shake + (heavy ? 3.2 : 0.6));
        Sfx.play(heavy ? 'heavy' : 'slash');
      }

      const near = [];
      g.grid.query(p.x, p.y, range + 60, near);
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d > range + e.r) continue;
        const a = angTo(p.x, p.y, e.x, e.y);
        const slack = e.r / Math.max(d, 1);
        if (Math.abs(angDiff(a, base)) > half + slack) continue;
        hitEnemy(g, w, s, e);
      }
    }
  },

  /* 投射物, 可多发/追踪/爆炸/减速 */
  projectile: {
    tick(g, w, s, p, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const range = s.range * p.areaMul;
      const tgt = g.nearestTarget(p.x, p.y, range);
      if (!tgt) return;
      startCd(w, s, p);

      const count = s.count || 1;
      const def = CONTENT.skills[w.id] || {};
      const fx = def.fx || (s.aoe ? 'fire' : 'bolt');
      const base = angTo(p.x, p.y, tgt.x, tgt.y);
      const spread = s.spread || 0.1;
      p.triggerAttack('cast', base, w.id, { style: fx });
      VFX.cast(p.x, p.y, p.r * 2.1, fx, def.color, { life: 0.34 });
      for (let i = 0; i < count; i++) {
        const a = base + (i - (count - 1) / 2) * spread + rnd(0.03, -0.03);
        const sx = p.x + Math.cos(a) * (p.r + 8);
        const sy = p.y + Math.sin(a) * (p.r + 8);
        g.projectiles.push(new Projectile({
          x: sx,
          y: sy,
          vx: Math.cos(a) * s.speed,
          vy: Math.sin(a) * s.speed,
          r: s.size || 6,
          dmg: s.dmg,
          pierce: s.pierce || 0,
          life: range / s.speed,
          color: s.color,
          aoe: (s.aoe || 0) * p.areaMul,
          homing: s.homing || 0,
          speed: s.speed,
          target: tgt,
          slow: s.slow || 0,
          slowT: s.slowT || 0,
          type: s.aoe ? 'fireball' : 'bolt',
          art: w.id,
          style: fx
        }));
        VFX.impact(sx, sy, fx, def.color, { life: 0.14 });
      }
      g.cam.shake = Math.min(12, g.cam.shake + (s.aoe && s.aoe > 75 ? 2.2 : 0.3));
      Sfx.play('shoot');
    }
  },

  /* 以玩家为圆心的范围爆发 */
  pbaoe: {
    tick(g, w, s, p, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const radius = s.radius * p.areaMul;
      const near = [];
      g.grid.query(p.x, p.y, radius + 60, near);
      const valid = [];
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        if (dist2(p.x, p.y, e.x, e.y) > (radius + e.r) * (radius + e.r)) continue;
        valid.push(e);
      }
      if (!valid.length) return;
      startCd(w, s, p);
      const def = CONTENT.skills[w.id] || {};
      const fx = def.fx || 'gold';
      const spin = w.id === 'whirlwind' || w.id === 'bladestorm';
      p.triggerAttack(spin ? 'spin' : (fx === 'ice' ? 'cast' : 'slam'), null, w.id, {
        style: fx, dur: spin ? 0.42 : 0.4
      });
      if (w.id === 'arcane_explosion') {
        // 奥爆: 力场炸裂, 有自己的形态, 不用通用爆发
        VFX.pulse(p.x, p.y, radius * 1.08, 'arcane', def.color, {
          life: 0.66, heavy: radius >= 150
        });
      } else {
        VFX.burst(p.x, p.y, radius, fx, def.color, {
          heavy: radius >= 150 || w.id === 'thunder_clap',
          life: w.id === 'thunder_clap' ? 0.62 : 0.52
        });
      }
      VFX.shock(p.x, p.y, radius * 0.9, fx, def.color, { heavy: radius >= 150 });
      if (spin) {
        // 旋风斩: 真旋转姿态 + 龙卷风演出
        VFX.spin(p.x, p.y, radius * 1.12, fx, def.color, {
          life: w.id === 'bladestorm' ? 0.62 : 0.52,
          heavy: w.id === 'bladestorm'
        });
        VFX.dust(p.x, p.y, fx, def.color, { life: 0.5 });
      }
      if (w.id === 'thunder_clap') {
        // 踩地板: 裂地贴花 + 碎石 + 冲击环
        VFX.slam(p.x, p.y, radius * 1.05, 'thunder', def.color, { debris: 18 });
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5 + rnd(0.4);
          VFX.lightning(p.x, p.y, p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius,
            'thunder', def.color, { life: 0.22 });
        }
        g.cam.shake = Math.min(22, g.cam.shake + 6);
        g.freeze(0.07);
      }
      if (w.id === 'frost_nova') {
        VFX.cast(p.x, p.y, radius * 0.8, 'ice', def.color, { life: 0.55 });
      }
      g.cam.shake = Math.min(16, g.cam.shake + (radius >= 150 ? 3 : 1));
      if (spin) Sfx.play('whirl');
      else if (w.id === 'thunder_clap') Sfx.play('quake');
      else Sfx.play('shoot');
      for (let i = 0; i < valid.length; i++) hitEnemy(g, w, s, valid[i]);
    }
  },

  /* 地面区域: 暴风雪 / 烈焰风暴 */
  ground: {
    tick(g, w, s, p, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const castRange = s.castRange * p.areaMul;
      const radius = s.radius * p.areaMul;
      const tgt = pickCluster(g, p, castRange, radius);
      if (!tgt) return;
      startCd(w, s, p);
      const def = CONTENT.skills[w.id] || {};
      const fx = def.fx || (s.dps ? 'ice' : 'fire');
      const ang = angTo(p.x, p.y, tgt.x, tgt.y);
      p.triggerAttack('cast', ang, w.id, { style: fx, dur: 0.46 });
      VFX.cast(tgt.x, tgt.y, radius * 0.72, fx, def.color, { life: 0.55 });
      if (s.dps) {
        g.zones.push(new Zone({
          x: tgt.x, y: tgt.y, r: radius, kind: 'field',
          duration: s.duration, tick: s.tick, dps: s.dps,
          slow: s.slow, slowT: s.slowT, color: s.color, id: w.id,
          art: w.id, style: fx
        }));
      } else {
        g.zones.push(new Zone({
          x: tgt.x, y: tgt.y, r: radius, kind: 'burst',
          delay: s.delay || 0.35, dmg: s.dmg, color: s.color, id: w.id,
          art: w.id, style: fx
        }));
      }
      Sfx.play('shoot');
    }
  },

  /* 连锁闪电 */
  chain: {
    tick(g, w, s, p, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      let cur = g.nearestTarget(p.x, p.y, s.range * p.areaMul);
      if (!cur) return;
      startCd(w, s, p);
      Sfx.play('shoot');
      const def = CONTENT.skills[w.id] || {};
      const fx = def.fx || 'thunder';
      p.triggerAttack('cast', angTo(p.x, p.y, cur.x, cur.y), w.id, { style: fx });

      let prevX = p.x, prevY = p.y;
      const hit = [];
      for (let i = 0; i < s.chains && cur; i++) {
        VFX.lightning(prevX, prevY, cur.x, cur.y, fx, def.color, {
          life: 0.2 + (i === 0 ? 0.06 : 0)
        });
        VFX.impact(cur.x, cur.y, fx, def.color, { life: 0.16 });
        FX.spark(cur.x, cur.y, s.color || '#a29bfe', 6, 130, 0.35);
        damageEnemy(g, cur, s.dmg * (1 - i * (s.falloff || 0)), { color: s.color });
        hit.push(cur);
        prevX = cur.x;
        prevY = cur.y;
        cur = g.nearestEnemy(prevX, prevY, 250, hit);
      }
    }
  },

  /* 自身增益 / 护盾 / 无敌 */
  buff: {
    tick(g, w, s, p, dt) {
      w.t -= dt;
      if (w.t > 0) return;

      if (s.triggerHp) {
        if (p.hp / p.maxHp > s.triggerHp) return;
      } else if (!g.nearestEnemy(p.x, p.y, 400)) {
        return;
      }

      startCd(w, s, p);
      const def = CONTENT.skills[w.id] || {};
      const fx = def.fx || 'gold';
      p.triggerAttack('buff', null, w.id, { style: fx, dur: 0.55 });
      p.applyBuff(w.id, s);
      VFX.aura(p.x, p.y, p.r + (s.shield ? 18 : 10), fx, def.color, { life: 0.85 });
      VFX.cast(p.x, p.y, p.r * 2.2, fx, def.color, { life: 0.65 });
      if (s.shield) VFX.shock(p.x, p.y, p.r + 24, fx, def.color, { life: 0.5 });
      Sfx.play(s.invuln ? 'level' : 'shoot');
    }
  },

  /* 冲锋 / 闪现（旧自动施放入口：位移主体已抽到 Player.castDisplacement） */
  dash: {
    tick(g, w, s, p, dt) {
      w.t -= dt;
      if (w.t > 0) return;

      const mode = s.mode || (s.minDist ? 'toward' : 'away');
      const near = g.nearestTarget(p.x, p.y, s.maxDist || 420);
      if (!near) return;
      const d = dist(p.x, p.y, near.x, near.y);

      let target = null;
      if (mode === 'toward') {
        if (d < (s.minDist || 0) || d > (s.maxDist || 360)) return;
        target = { x: near.x, y: near.y };
      } else if (d > (s.triggerDist || 130)) {
        return;
      }

      const ok = p.castDisplacement(g, target, { id: w.id, level: w.lvl, free: true });
      if (ok) w.t = (s.recharge || s.cd || 6) * p.cdMul;
    }
  },

  /* 持续引导: 剑刃风暴 */
  channel: {
    tick(g, w, s, p, dt) {
      const radius = s.radius * p.areaMul;
      const def = CONTENT.skills[w.id] || {};
      const fx = def.fx || 'gold';

      if (w.channelT > 0) {
        p.channel = { id: w.id, style: fx, color: def.color || s.color, radius };
        w.channelT -= dt;
        w.channelTick -= dt;
        if (w.channelTick <= 0) {
          w.channelTick = s.tick;
          const near = [];
          g.grid.query(p.x, p.y, radius + 60, near);
          let hit = 0;
          for (let i = 0; i < near.length; i++) {
            const e = near[i];
            if (e.dead) continue;
            if (dist2(p.x, p.y, e.x, e.y) > (radius + e.r) * (radius + e.r)) continue;
            damageEnemy(g, e, s.dmg, { color: s.color });
            hit++;
          }
          if (hit) {
            VFX.slash(p.x, p.y, p.walk * 0.6, radius * 0.9, 2.4, fx, def.color, { life: 0.16 });
            Sfx.play('hit');
          }
        }
        if (w.channelT <= 0) {
          w.channelT = 0;
          p.channel = null;
        }
        return;
      }

      w.t -= dt;
      if (w.t > 0) return;

      const near = [];
      g.grid.query(p.x, p.y, radius + 60, near);
      let count = 0;
      for (let i = 0; i < near.length; i++) {
        const e = near[i];
        if (e.dead) continue;
        if (dist2(p.x, p.y, e.x, e.y) <= (radius + e.r) * (radius + e.r)) count++;
      }
      if (count < 3) return;

      startCd(w, s, p);
      w.channelT = s.duration;
      w.channelTick = 0;
      p.triggerAttack('spin', null, w.id, { style: fx, dur: 0.5 });
      p.channel = { id: w.id, style: fx, color: def.color || s.color, radius };
      VFX.burst(p.x, p.y, radius, fx, def.color, { heavy: true, life: 0.5 });
      VFX.shock(p.x, p.y, radius, fx, def.color, { heavy: true, life: 0.45 });
      Sfx.play('level');
    }
  },

  /* 击杀触发 */
  onkill: {
    tick() { /* 由 killEnemy 处理 */ }
  }
};

/* ---------------- 伤害 ---------------- */
function damageEnemy(g, e, dmg, opt) {
  if (!e || e.dead) return 0;
  opt = opt || {};
  const p = g.player;

  let real = dmg * p.dmgMul;
  if (opt.execute && e.maxHp > 0) {
    const frac = e.hp / e.maxHp;
    if (frac < opt.execute.threshold) real *= opt.execute.mult;
  }
  if (opt.crit) real *= opt.crit;
  if (e.vuln > 0) real *= 1 + e.vuln;

  e.hp -= real;
  e.flash = 0.1;
  p.damageDealt += real;

  if (!opt.quiet && e.hp > 0) {
    FX.text(e.x + rnd(9, -9), e.y - e.r - 2, String(Math.round(real)),
      opt.color || '#ffffff', e.boss ? 17 : 13, 0.55);
  }
  if (e.hp <= 0) {
    killEnemy(g, e);
    return real;
  }
  if (!opt.silent) Sfx.play('hit');
  return real;
}

function killEnemy(g, e) {
  if (e.dead) return;
  e.dead = true;
  g.kills++;
  g.killThisSecond++;

  const big = e.boss || e.elite;
  FX.spark(e.x, e.y, e.baseColor, e.boss ? 70 : (e.elite ? 26 : 9), e.boss ? 300 : 210, 0.65, e.boss ? 6 : 3);
  FX.ring(e.x, e.y, e.r + 8, e.color, 0.35);
  if (big) {
    VFX.burst(e.x, e.y, e.boss ? e.r * 2.4 : e.r * 1.7, e.boss ? 'abyss' : 'gold',
      e.baseColor, { heavy: true, life: e.boss ? 0.9 : 0.6 });
    VFX.shock(e.x, e.y, e.r * 2.2, e.boss ? 'abyss' : 'gold', e.baseColor, { heavy: true });
  }
  Sfx.play('kill');
  if (big) g.cam.shake = Math.min(20, g.cam.shake + (e.boss ? 14 : 4));

  const goldOn = g.runMode === 'slot';
  if (e.boss) {
    g.spawnGemBurst(e.x, e.y, e.xp, 12);
    g.dropGem(e.x, e.y, 0, 30);
    if (goldOn) g.dropGoldBurst(e.x, e.y, g.bossGold(e.tier));
    g.onBossKilled(e);
  } else if (e.elite) {
    g.spawnGemBurst(e.x, e.y, e.xp, 4);
    g.dropGem(e.x, e.y, 0, 25);     // 精英必掉回血
    if (goldOn && Math.random() < CONTENT.gold.eliteChance) {
      g.dropGold(e.x, e.y, CONTENT.gold.eliteValue);
    }
  } else {
    g.dropGem(e.x, e.y, e.xp);
    if (rnd() < (g.mods.healChance || 0)) g.dropGem(e.x, e.y, 0, 20);
    if (goldOn && Math.random() < CONTENT.gold.mobChance) {
      g.dropGold(e.x, e.y, CONTENT.gold.mobValue);
    }
  }

  // 狂怒终极: 击杀后短暂加速
  if (g.player.onKill) {
    g.player.applyBuff('talent_fury', {
      duration: g.player.onKill.duration,
      speedMul: g.player.onKill.mul
    });
  }

  // 胜利在望
  const vr = g.player.skill('victory_rush');
  if (vr) {
    const s = skillStats(g.player, CONTENT.skills.victory_rush, vr);
    if (g.t - vr.lastKill >= s.internalCd) {
      vr.lastKill = g.t;
      const healed = g.player.heal(g.player.maxHp * s.healPct);
      if (healed > 0) FX.text(g.player.x, g.player.y - 28, '+' + Math.round(healed), '#5be08a', 13, 0.6);
    }
  }
}

function explode(g, pr) {
  const style = pr.style || 'fire';
  const heavy = pr.aoe >= 75;
  VFX.burst(pr.x, pr.y, pr.aoe, style, pr.color, { heavy, life: heavy ? 0.7 : 0.55 });
  VFX.shock(pr.x, pr.y, pr.aoe * 0.9, style, pr.color, { heavy, life: 0.42 });
  Sfx.play('hit');
  if (heavy) g.cam.shake = Math.min(18, g.cam.shake + 4);
  const near = [];
  g.grid.query(pr.x, pr.y, pr.aoe + 60, near);
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (e.dead) continue;
    if (dist2(pr.x, pr.y, e.x, e.y) > (pr.aoe + e.r) * (pr.aoe + e.r)) continue;
    damageEnemy(g, e, pr.dmg * 0.85, { quiet: true, color: pr.color });
  }
}

/* ---------------- 弹体推进与碰撞 ---------------- */
function updateProjectiles(g, dt) {
  const near = [];
  for (let i = 0; i < g.projectiles.length; i++) {
    const pr = g.projectiles[i];
    pr.update(dt, g);
    if (pr.dead) continue;

    if (pr.hostile) {
      const p = g.player;
      const rr = pr.r + p.r;
      if (dist2(pr.x, pr.y, p.x, p.y) < rr * rr) {
        p.hurt(pr.dmg, g);
        pr.dead = true;
        VFX.impact(pr.x, pr.y, pr.style || 'shadow', pr.color, { life: 0.2 });
        FX.spark(pr.x, pr.y, pr.color, 6, 120);
      }
      continue;
    }

    g.grid.query(pr.x, pr.y, pr.r + 90, near);
    for (let j = 0; j < near.length; j++) {
      const e = near[j];
      if (e.dead || pr.hits.has(e)) continue;
      const rr = e.r + pr.r;
      if (dist2(pr.x, pr.y, e.x, e.y) > rr * rr) continue;

      if (pr.aoe > 0) {
        pr.dead = true;
        explode(g, pr);
        break;
      }
      pr.hits.add(e);
      VFX.impact(pr.x, pr.y, pr.style || 'bolt', pr.color, { life: 0.15 });
      damageEnemy(g, e, pr.dmg, { color: pr.color });
      if (!e.dead && pr.slow) {
        e.slow = Math.max(e.slow, pr.slow);
        e.slowT = Math.max(e.slowT, pr.slowT || 0);
      }
      if (pr.pierce > 0) pr.pierce--;
      else { pr.dead = true; break; }
    }
  }
}

/* ---------------- 持续伤害 ---------------- */
function updateDots(g, dt) {
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
    if (e.dead || !e.dots.length) continue;
    for (let j = e.dots.length - 1; j >= 0; j--) {
      const d = e.dots[j];
      d.t -= dt;
      d.tickT -= dt;
      if (d.tickT <= 0) {
        d.tickT += 0.5;
        damageEnemy(g, e, d.dps * 0.5, { quiet: true, silent: true, color: d.color });
        if (e.dead) break;
      }
      if (d.t <= 0) e.dots.splice(j, 1);
    }
  }
}

/* ---------------- 敌人互相分离, 避免完全重叠 ---------------- */
function separateEnemies(g, dt) {
  const near = [];
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
    if (e.dead || e.boss) continue;
    g.grid.query(e.x, e.y, e.r * 2.2, near);
    let px = 0, py = 0, n = 0;
    for (let j = 0; j < near.length && n < 6; j++) {
      const o = near[j];
      if (o === e || o.dead) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      const d2v = dx * dx + dy * dy;
      const rr = e.r + o.r;
      if (d2v < 0.001 || d2v > rr * rr) continue;
      const d = Math.sqrt(d2v);
      const push = (rr - d) / rr * (o.boss ? 0.25 : 1);
      px += (dx / d) * push;
      py += (dy / d) * push;
      n++;
    }
    if (n) {
      e.x += px * 135 * dt;
      e.y += py * 135 * dt;
    }
  }
}

/* ---------------- 刷怪 ---------------- */
class Spawner {
  constructor() { this.reset(); }

  reset() {
    this.t = 0;
    this.spawnT = 0.5;
    this.eliteT = CONTENT.eliteEvery;
    this.bossIndex = 0;
    this.opened = false;
  }

  waveAt(t) {
    let w = CONTENT.waves[0];
    for (let i = 0; i < CONTENT.waves.length; i++) {
      if (t >= CONTENT.waves[i].t) w = CONTENT.waves[i];
    }
    return w;
  }

  update(g, dt) {
    this.t += dt;
    const wave = this.waveAt(this.t);

    // 开局先丢几只进视野, 避免前十几秒空场
    if (!this.opened) {
      this.opened = true;
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4 + rnd(0.5);
        g.spawnEnemy('slime', g.player.x + Math.cos(a) * 330, g.player.y + Math.sin(a) * 330, false);
      }
    }

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = wave.interval * (g.mods.spawnMul || 1);
      // 硬核的 batchBonus: 越到后面每波多塞几只, 形成「满屏」
      const bonus = (g.mods.batchBonus && this.t > 150) ? g.mods.batchBonus : 0;
      for (let i = 0; i < wave.batch + bonus; i++) {
        if (g.enemies.length >= (g.mods.maxEnemies || CONTENT.maxEnemies)) break;
        g.spawnAround(pick(wave.types), false);
      }
    }

    this.eliteT -= dt;
    if (this.eliteT <= 0) {
      this.eliteT = g.mods.eliteEvery || CONTENT.eliteEvery;
      const types = wave.types.slice(0, Math.min(3, wave.types.length));
      const type = pick(types);
      g.spawnAround(type, true);
      for (let i = 0; i < 3; i++) g.spawnAround(pick(wave.types), false);
      g.announce('精英出现');
    }

    // 5 阶 Boss: 到点就刷, 不等待上一只死亡
    while (this.bossIndex < CONTENT.bossTimes.length && this.t >= CONTENT.bossTimes[this.bossIndex]) {
      const tier = this.bossIndex + 1;
      g.spawnBoss(tier);
      this.bossIndex++;
    }
  }
}

/* ---------------- 升级卡池 ---------------- */
function makeOffer(p, cand) {
  if (cand.kind === 'skill') {
    const d = CONTENT.skills[cand.id];
    return {
      kind: 'skill', id: cand.id, title: d.name, icon: d.icon,
      color: d.color, tag: '新技能', desc: d.desc, from: 0, to: 1
    };
  }
  if (cand.kind === 'up') {
    const w = p.skill(cand.id);
    const d = CONTENT.skills[cand.id];
    return {
      kind: 'up', id: cand.id, title: d.name, icon: d.icon, color: d.color,
      tag: '技能升级', desc: d.up[w.lvl - 1], from: w.lvl, to: w.lvl + 1
    };
  }
  const lv = p.passiveLevel(cand.id);
  const d = CONTENT.passives[cand.id];
  return {
    kind: 'passive', id: cand.id, title: d.name, icon: d.icon,
    color: '#ffd166', tag: '被动强化', desc: d.desc, from: lv, to: lv + 1
  };
}

function pickWeighted(weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let r = RNG() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function rollOffers(p, count) {
  const classDef = CONTENT.classes[p.classId] || CONTENT.classes.warrior;

  // 新技能
  const newPool = [], newW = [];
  if (p.skills.length < CONTENT.maxSkills) {
    for (let i = 0; i < classDef.skills.length; i++) {
      const id = classDef.skills[i];
      const def = CONTENT.skills[id];
      if (!def || def.displacement) continue;
      if (!p.skill(id)) {
        newPool.push({ kind: 'skill', id });
        newW.push(p.skills.length < 3 ? 2.4 : 1.6);
      }
    }
  }

  // 技能升级
  const upPool = [], upW = [];
  for (let i = 0; i < p.skills.length; i++) {
    const w = p.skills[i];
    const def = CONTENT.skills[w.id];
    if (w.lvl < def.lvl.length) {
      upPool.push({ kind: 'up', id: w.id });
      upW.push(2.6);
    }
  }

  // 通用被动
  const pasPool = [], pasW = [];
  for (const id in CONTENT.passives) {
    if (p.passiveLevel(id) < CONTENT.passives[id].max) {
      pasPool.push({ kind: 'passive', id });
      pasW.push(1.0);
    }
  }

  const offers = [];

  // 保底一张技能相关
  let pool = newPool.concat(upPool);
  let weights = newW.concat(upW);
  if (count > 0 && pool.length) {
    const i = pickWeighted(weights);
    offers.push(makeOffer(p, pool[i]));
    pool.splice(i, 1);
    weights.splice(i, 1);
  }

  pool = pool.concat(pasPool);
  weights = weights.concat(pasW);
  while (offers.length < count && pool.length) {
    const i = pickWeighted(weights);
    offers.push(makeOffer(p, pool[i]));
    pool.splice(i, 1);
    weights.splice(i, 1);
  }

  return offers;
}

function applyOffer(p, offer) {
  if (offer.kind === 'passive') p.addPassive(offer.id);
  else p.addSkill(offer.id);
}
