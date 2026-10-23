/* =========================================================
   深渊回响 — 实体: 玩家 / 敌人 / 弹体 / 经验宝石 / 地面区域
   ========================================================= */

'use strict';

const BASE_HP = 120;
const BASE_SPEED = 178;

class Player {
  constructor(x, y, classId, skin, meta) {
    const def = CONTENT.classes[classId] || CONTENT.classes.warrior;
    this.classId = def.id;
    this.className = def.name;

    // 元进度: 天赋聚合加成。没有 meta 时就是纯职业基础数值。
    this.meta = meta || null;
    this.skillMods = (meta && meta.skills) || null;
    this.onKill = (meta && meta.onKill) || null;

    // 每个职业 2 个形象; skin 为 1-based, 缺省用第 1 个
    const skins = def.skins && def.skins.length ? def.skins : [def.id];
    this.skin = Math.max(1, Math.min(skins.length, Number(skin) || 1));
    this.skinKey = skins[this.skin - 1];

    this.x = x;
    this.y = y;
    this.r = 15;

    this.baseHp = def.hp;
    this.baseSpeed = def.speed;
    this.baseArmor = def.armor;
    this.baseDmgMul = def.dmgMul;
    this.baseCdMul = def.cdMul;
    this.baseMagnet = def.magnet || 130;

    this.hp = this.baseHp;
    this.maxHp = this.baseHp;

    // 由 recalc() 根据职业 / 被动 / 临时增益重新计算
    this.speed = this.baseSpeed;
    this.dmgMul = this.baseDmgMul;
    this.cdMul = this.baseCdMul;
    this.areaMul = 1;
    this.xpMul = 1;
    this.armor = this.baseArmor;
    this.magnet = this.baseMagnet;
    this.regen = 0;

    this.level = 1;
    this.xp = 0;
    this.xpNeed = CONTENT.xpBase;

    this.iframe = 0;
    this.flash = 0;
    this.alive = true;

    this.face = -Math.PI / 2;
    this.walk = 0;
    this.trail = [];
    this.lastMove = { x: 0, y: -1 };

    // 动画状态: 跑动 / 待机 / 攻击 / 引导
    this.facing = 1;              // 1 朝右, -1 朝左
    this.moving = false;
    this.idleT = rnd(TAU);
    this.attack = null;           // { kind, id, style, angle, t, dur, power }
    this.channel = null;          // 持续引导技能 { id, style, color, radius }
    this.stepT = 0;               // 脚步间隔

    this.skills = [];
    this.passives = Object.create(null);
    this.buffs = Object.create(null);
    this.shield = 0;
    this.shieldT = 0;
    this.invuln = 0;
    this.damageDealt = 0;

    // 独立位移技能: 空格触发, 2 层充能, 每层独立冷却
    const dispId = def.displacement || null;
    this.displacement = dispId ? {
      id: dispId,
      charges: (CONTENT.skills[dispId] && CONTENT.skills[dispId].charges) || 2,
      max: (CONTENT.skills[dispId] && CONTENT.skills[dispId].charges) || 2,
      t: 0,
      maxT: 6
    } : null;
    this.dash = null;

    this.recalc();
  }

  skill(id) {
    for (let i = 0; i < this.skills.length; i++) if (this.skills[i].id === id) return this.skills[i];
    return null;
  }

  passiveLevel(id) { return this.passives[id] || 0; }

  addSkill(id) {
    const def = CONTENT.skills[id];
    if (!def) return;
    const w = this.skill(id);
    if (w) {
      if (w.lvl < def.lvl.length) w.lvl++;
      return;
    }
    if (this.skills.length >= CONTENT.maxSkills) return;
    this.skills.push({
      id,
      lvl: 1,
      t: 0.2,
      phase: 0,
      channelT: 0,
      channelTick: 0,
      lastKill: -999
    });
  }

  addPassive(id) {
    const def = CONTENT.passives[id];
    if (!def) return;
    const cur = this.passives[id] || 0;
    if (cur >= def.max) return;
    this.passives[id] = cur + 1;
    this.recalc();
  }

  applyBuff(id, s) {
    const b = this.buffs[id] || (this.buffs[id] = { id, t: 0 });
    b.t = Math.max(b.t || 0, s.duration || 0);
    b.dmgMul = s.dmgMul || 0;
    b.armor = s.armor || 0;
    b.speedMul = s.speedMul || 1;
    if (s.shield) {
      this.shield = Math.max(this.shield, s.shield);
      this.shieldT = Math.max(this.shieldT, s.duration || 0);
    }
    if (s.invuln) this.invuln = Math.max(this.invuln, s.invuln);
    this.recalc();
  }

  recalc() {
    const def = CONTENT.classes[this.classId] || CONTENT.classes.warrior;
    const oldMax = this.maxHp;

    this.maxHp = def.hp;
    this.speed = def.speed;
    this.dmgMul = def.dmgMul;
    this.cdMul = def.cdMul;
    this.areaMul = 1;
    this.xpMul = 1;
    this.armor = def.armor;
    this.magnet = def.magnet || 130;
    this.regen = 0;

    for (const id in this.passives) {
      const pdef = CONTENT.passives[id];
      if (pdef) pdef.apply(this, this.passives[id]);
    }

    for (const id in this.buffs) {
      const b = this.buffs[id];
      if (!b || b.t <= 0) continue;
      this.dmgMul += b.dmgMul || 0;
      this.armor += b.armor || 0;
      if (b.speedMul && b.speedMul !== 1) this.speed *= b.speedMul;
    }

    // 天赋永久加成放在被动 / 临时增益之后, 只影响本局, 不改 CONTENT。
    const m = this.meta;
    if (m) {
      if (m.hpPct) this.maxHp *= 1 + m.hpPct;
      if (m.dmgPct) this.dmgMul += m.dmgPct;
      if (m.cdrPct) this.cdMul *= 1 - clamp(m.cdrPct, 0, 0.6);
      if (m.armorAdd) this.armor += m.armorAdd;
      if (m.speedAdd) this.speed += m.speedAdd;
      if (m.areaPct) this.areaMul += m.areaPct;
      if (m.xpPct) this.xpMul += m.xpPct;
      if (m.magnetAdd) this.magnet += m.magnetAdd;
      if (m.regenAdd) this.regen += m.regenAdd;
    }

    const gained = this.maxHp - oldMax;
    if (gained > 0) this.hp = Math.min(this.maxHp, this.hp + gained);
    this.hp = Math.min(this.hp, this.maxHp);
  }

  update(dt, g) {
    this.tickDisplacement(dt);

    const dashing = !!this.dash;
    const a = dashing ? { x: 0, y: 0 } : Input.axis();
    const moving = dashing || !!(a.x || a.y);
    this.moving = moving;
    if (!dashing && a.x) this.facing = a.x < 0 ? -1 : 1;
    if (!dashing && moving) {
      this.lastMove.x = a.x;
      this.lastMove.y = a.y;
      this.face = Math.atan2(a.y, a.x);
    }

    if (dashing) {
      this.stepDash(dt, g);
    } else {
      this.x += a.x * this.speed * dt;
      this.y += a.y * this.speed * dt;
    }

    const W = CONTENT.world;
    this.x = clamp(this.x, this.r, W.w - this.r);
    this.y = clamp(this.y, this.r, W.h - this.r);

    // 跑动 / 待机两套节奏; 攻击时再叠加出招姿态
    this.walk += dt * (moving ? 11 : 3.2);
    this.idleT += dt * (moving ? 0.55 : 1);
    if (this.attack) {
      this.attack.t += dt;
      if (this.attack.t >= this.attack.dur) this.attack = null;
    }
    if (moving && !dashing) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.23;
        if (typeof VFX !== 'undefined') {
          const side = this.facing;
          VFX.dust(this.x - side * this.r * 0.6 + (Math.random() * 6 - 3),
            this.y + this.r * 1.5, 'gold', 'rgba(190,175,145,0.7)', { life: 0.4 });
        }
      }
    } else {
      this.stepT = 0;
    }

    // 残影
    this.trail.push({ x: this.x, y: this.y, life: 0.22 });
    if (this.trail.length > 16) this.trail.shift();
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }

    if (this.iframe > 0) this.iframe -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    let expired = false;
    for (const id in this.buffs) {
      const b = this.buffs[id];
      b.t -= dt;
      if (b.t <= 0) { delete this.buffs[id]; expired = true; }
    }
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) { this.shieldT = 0; this.shield = 0; }
    }
    if (expired) this.recalc();

    if (this.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    }
  }

  /* ---------------- 独立位移技能（空格 / 2 层充能） ---------------- */
  dispLevel() {
    return clamp(1 + Math.floor((this.level - 1) / 8), 1, 5);
  }

  dispStats() {
    const d = this.displacement;
    if (!d) return null;
    const def = CONTENT.skills[d.id];
    if (!def) return null;
    return { def: def, s: skillStats(this, def, { id: d.id, lvl: this.dispLevel() }) };
  }

  tickDisplacement(dt) {
    const d = this.displacement;
    if (!d) return;
    if (d.charges >= d.max) { d.t = 0; return; }
    d.t -= dt;
    if (d.t <= 0) {
      d.charges = Math.min(d.max, d.charges + 1);
      d.t = d.charges < d.max ? d.maxT : 0;
    }
  }

  /* target 省略时自动选目标（供旧 dash 行为 / AI 使用）；有 target 就是鼠标落点 */
  castDisplacement(g, target, opt) {
    opt = opt || {};
    if (!this.alive || this.dash) return false;
    const d = this.displacement;
    const id = opt.id || (d && d.id);
    const def = id ? CONTENT.skills[id] : null;
    if (!def) return false;

    const lvl = opt.level || (d && d.id === id ? this.dispLevel() : 1);
    const s = skillStats(this, def, { id: id, lvl: lvl });

    const free = !!opt.free;
    if (!free && d && d.id === id && d.charges <= 0) return false;

    let tx, ty;
    if (target && isFinite(target.x) && isFinite(target.y)) {
      tx = target.x;
      ty = target.y;
    } else if (def.displacementType === 'blink') {
      const spot = findBlinkSpot(g, this, s.distance);
      tx = spot.x;
      ty = spot.y;
    } else {
      const near = g.nearestTarget(this.x, this.y, s.maxDist || 420);
      if (!near) return false;
      tx = near.x;
      ty = near.y;
    }

    const W = CONTENT.world;
    let dx = tx - this.x;
    let dy = ty - this.y;
    let len = Math.hypot(dx, dy);
    const maxDist = s.distance || 240;
    if (len > maxDist) {
      dx = dx / len * maxDist;
      dy = dy / len * maxDist;
      len = maxDist;
      tx = this.x + dx;
      ty = this.y + dy;
    }
    if (len < (opt.free ? 12 : 28)) return false;

    const ox = this.x, oy = this.y;
    const nx = clamp(tx, this.r + 4, W.w - this.r - 4);
    const ny = clamp(ty, this.r + 4, W.h - this.r - 4);
    if (Math.hypot(nx - ox, ny - oy) < 12) return false;

    if (!free && d && d.id === id) {
      d.charges--;
      d.maxT = s.recharge || d.maxT;
      d.t = d.maxT;
    }

    const a = Math.atan2(ny - oy, nx - ox);
    this.face = a;
    this.facing = Math.cos(a) < 0 ? -1 : 1;
    this.lastMove.x = Math.cos(a);
    this.lastMove.y = Math.sin(a);
    this.invuln = Math.max(this.invuln, s.invuln || 0.35);
    this.iframe = Math.max(this.iframe, 0.22);
    const style = def.fx || 'gold';
    this.triggerAttack('dash', a, id, { style: style, dur: 0.3 });

    if (def.displacementType === 'blink') {
      this.x = nx;
      this.y = ny;
      VFX.impact(ox, oy, style, def.color, { life: 0.24 });
      VFX.aura(ox, oy, this.r + 10, style, def.color, { life: 0.4 });
      VFX.impact(nx, ny, style, def.color, { life: 0.28 });
      VFX.shock(nx, ny, 46, style, def.color, { life: 0.36 });
      FX.spark(ox, oy, def.color, 10, 190, 0.4);
      FX.spark(nx, ny, def.color, 12, 210, 0.45);
      g.cam.shake = Math.min(10, g.cam.shake + 2);
      Sfx.play('shoot');
    } else {
      const speed = def.dashSpeed || 1000;
      const dur = clamp(Math.hypot(nx - ox, ny - oy) / speed, 0.14, 0.42);
      this.dash = {
        kind: 'charge', id: id, x0: ox, y0: oy, tx: nx, ty: ny,
        t: 0, dur: dur, dmg: s.dmg || 0, radius: s.radius || 70,
        hit: new Set(), style: style, color: def.color, dustT: 0
      };
      VFX.dust(ox, oy, style, def.color, { life: 0.5 });
      VFX.shock(ox, oy, 42, style, def.color, { life: 0.3 });
      g.cam.shake = Math.min(12, g.cam.shake + 3);
      Sfx.play('shoot');
    }
    return true;
  }

  stepDash(dt, g) {
    const d = this.dash;
    if (!d) return;
    d.t += dt;
    const k = clamp(d.t / d.dur, 0, 1);
    const e = k * k * (3 - 2 * k);       // 起步加速, 末端收住
    this.x = lerp(d.x0, d.tx, e);
    this.y = lerp(d.y0, d.ty, e);

    d.dustT -= dt;
    if (d.dustT <= 0) {
      d.dustT = 0.035;
      VFX.dust(this.x, this.y, d.style, d.color, { life: 0.34 });
      FX.spark(this.x, this.y, d.color, 2, 80, 0.22, 2);
    }

    if (d.dmg > 0) {
      const near = [];
      g.grid.query(this.x, this.y, d.radius + 90, near);
      for (let i = 0; i < near.length; i++) {
        const en = near[i];
        if (!en || en.dead || d.hit.has(en)) continue;
        const rr = d.radius + en.r;
        if (dist2(this.x, this.y, en.x, en.y) > rr * rr) continue;
        d.hit.add(en);
        damageEnemy(g, en, d.dmg, { color: d.color });
        FX.spark(en.x, en.y, d.color, 8, 190, 0.35);
        VFX.impact(en.x, en.y, d.style, d.color, { life: 0.2 });
        if (!en.boss && !en.dead) {
          const ka = Math.atan2(en.y - this.y, en.x - this.x);
          en.x += Math.cos(ka) * 34;
          en.y += Math.sin(ka) * 34;
        }
        g.cam.shake = Math.min(14, g.cam.shake + 1.2);
      }
    }

    if (k >= 1) {
      this.x = d.tx;
      this.y = d.ty;
      this.dash = null;
      VFX.shock(this.x, this.y, d.radius * 0.9, d.style, d.color, { life: 0.34 });
      VFX.impact(this.x, this.y, d.style, d.color, { life: 0.24 });
      g.cam.shake = Math.min(14, g.cam.shake + 2);
    }
  }

  /* 技能施放时调用: 切换出招姿态, 让静态贴图也有动作感。
     kind: strike / cast / slam / buff / dash / spin */
  triggerAttack(kind, angle, id, opt) {
    opt = opt || {};
    const kindDur = { strike: 0.30, cast: 0.34, slam: 0.44, buff: 0.55, dash: 0.28, spin: 0.42 };
    const dur = opt.dur || kindDur[kind] || 0.3;
    this.attack = {
      kind, id: id || '', style: opt.style || '',
      angle: angle == null ? this.facing : angle,
      t: 0, dur,
      power: opt.power || 1
    };
    if (angle != null && Math.abs(Math.cos(angle)) > 0.08) {
      this.facing = Math.cos(angle) < 0 ? -1 : 1;
    }
  }

  /* 计算当前绘制姿态, 渲染层只负责套用, 不重复写动画逻辑 */
  animPose() {
    const moving = this.moving;
    const walk = this.walk;
    const idle = this.idleT;

    // 跑动时上下弹跳 + 左右微倾; 待机时呼吸起伏
    let bob = Math.sin(walk * 0.9) * (moving ? 2.1 : 0.9) + Math.sin(idle * 1.7) * 0.55;
    let rot = Math.sin(walk) * (moving ? 0.035 : 0.012);
    let sx = 1, sy = 1;
    if (moving) {
      sy = 1 + Math.sin(walk * 2) * 0.018;
      sx = 1 - Math.sin(walk * 2) * 0.012;
    } else {
      sy = 1 + Math.sin(idle * 2.2) * 0.012;
      sx = 1 - Math.sin(idle * 2.2) * 0.008;
    }

    let lunge = 0, lift = 0;
    const a = this.attack;
    if (a) {
      const u = clamp(a.t / a.dur, 0, 1);
      const wind = 0.30, hit = 0.55;
      if (u < wind) {
        const k = Math.sin(u / wind * Math.PI / 2);
        lunge = -6 * k;
        rot -= 0.13 * k;
        sy += 0.045 * k;
        sx -= 0.025 * k;
      } else if (u < hit) {
        const k = Math.sin((u - wind) / (hit - wind) * Math.PI);
        lunge = 15 * k;
        rot += 0.18 * k;
        sx += 0.055 * k;
        sy -= 0.03 * k;
        lift = 1.8 * k;
      } else {
        const k = 1 - (u - hit) / (1 - hit);
        lunge = 5 * k;
        rot += 0.05 * k;
      }
      if (a.kind === 'cast') {
        rot += 0.035 * Math.sin(u * Math.PI);
        lift += 2.2 * Math.sin(u * Math.PI);
      } else if (a.kind === 'slam') {
        lift -= Math.sin(Math.min(1, u / 0.35) * Math.PI / 2) * 8;
        if (u > 0.35) sy -= 0.055 * Math.sin((u - 0.35) / 0.65 * Math.PI);
      } else if (a.kind === 'dash') {
        sx += 0.09;
        sy -= 0.045;
        lift += 3;
      } else if (a.kind === 'buff') {
        sy += 0.05 * Math.sin(u * Math.PI);
      } else if (a.kind === 'spin') {
        // 2D 里用「横向压扁 + 翻转」模拟原地转身, 比直接转贴图更像人在旋身;
        // 旧的 0.35rad 几乎看不出在转, 旋风斩没有「不停旋转」的观感。
        const yaw = u * TAU * 1.5;
        const c = Math.cos(yaw);
        sx *= (c < 0 ? -1 : 1) * Math.max(0.16, Math.abs(c));
        sy *= 1 - 0.07 * Math.abs(Math.sin(yaw));
        rot += Math.sin(yaw) * 0.12;
        lift += Math.sin(u * Math.PI) * 2.5;
      }
    }

    return { bob, rot, sx, sy, lunge, lift, moving };
  }

  heal(v) {
    if (!this.alive) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + v);
    return this.hp - before;
  }

  hurt(dmg, g) {
    if (this.invuln > 0 || this.iframe > 0 || !this.alive) return;

    let real = Math.max(1, dmg * (1 - clamp(this.armor, 0, 0.7)));

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, real);
      this.shield -= absorbed;
      real -= absorbed;
      if (this.shield <= 0) { this.shield = 0; this.shieldT = 0; }
      if (real <= 0) {
        this.iframe = 0.24;
        FX.spark(this.x, this.y, '#8ecbff', 8, 150);
        Sfx.play('hit');
        return;
      }
    }

    this.hp -= real;
    this.iframe = 0.62;
    this.flash = 0.25;
    g.cam.shake = Math.min(18, g.cam.shake + 7);
    FX.spark(this.x, this.y, '#ff6b8b', 12, 190);
    FX.text(this.x, this.y - 24, '-' + Math.round(real), '#ff8095', 15, 0.7);
    Sfx.play('hurt');
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      g.onPlayerDeath();
    }
  }
}

class Enemy {
  constructor(type, x, y, g, elite, tier) {
    const mods = g.mods || CONTENT.difficulties.normal;
    const ero = g.erosion || { hp: 1, dmg: 1 };
    this.type = type;
    this.elite = !!elite;
    this.boss = type === 'boss';
    this.tier = this.boss ? (tier || 1) : 0;

    // 每阶异族 Boss 的通用状态；非 Boss 也会保留默认值，避免 UI 读空。
    this.art = '';
    this.tag = '';
    this.mechanic = '';
    this.summonType = '';
    this.mechEvery = 0;
    this.mechT = 0;
    this.windup = 0;
    this.windupKind = '';
    this.castT = 0;
    this.castStyle = '';
    this.castA = 0;
    this.chargeT = 0;
    this.chargeVx = 0;
    this.chargeVy = 0;
    this.chargeA = 0;
    this.breathA = null;
    this.life = 0;

    let d;
    if (this.boss) {
      const base = CONTENT.bosses[this.tier - 1] || CONTENT.bosses[0];
      const alt = (CONTENT.bossAlts || []).find((b) => b.tier === this.tier);
      const useAlt = !!(alt && (g.forceBossAlt || (!g.forceBossEye && rnd(1) < 0.5)));
      d = useAlt ? Object.assign({}, base, alt) : base;
      this.tier = d.tier;
      this.name = d.name;
      this.r = d.r;
      this.maxHp = d.hp * mods.bossHp * ero.hp;
      this.hp = this.maxHp;
      this.speed = d.speed;
      this.dmg = d.dmg * mods.bossDmg * ero.dmg;
      this.xp = d.xp;
      this.baseColor = d.color;
      this.ai = 'boss';
      this.sides = d.sides || 12;
      this.fireT = 0;
      this.burst = d.burst;
      this.rings = d.rings;
      this.burstEvery = d.burstEvery;
      this.aimed = d.aimed;
      this.aimedEvery = d.aimedEvery;
      this.summons = d.summons;
      this.summonEvery = d.summonEvery;
      this.burstT = 1.6;
      this.aimedT = 2.4;
      this.summonT = 4.0;
      this.art = d.key || d.tier;
      this.tag = d.tag || '';
      this.mechanic = d.mechanic || '';
      this.summonType = d.summonType || '';
      this.mechEvery = d.mechEvery || 7;
      this.mechT = Math.min(4.5, this.mechEvery * 0.55);

      // 狂暴: 打不动的 Boss 会越来越难缠(单目标 DPS 门槛), 而不是无限僵持
      this.aliveT = 0;
      this.enraged = false;
      this.frenzied = false;
      this.baseBurstEvery = this.burstEvery;
      this.baseSummonEvery = this.summonEvery;
      this.baseDmg = this.dmg;
    } else {
      d = CONTENT.enemies[type];
      if (!d) d = CONTENT.enemies.slime;
      const mul = g.diff || { hp: 1, dmg: 1, speed: 1 };
      this.name = d.name;
      this.r = d.r * (elite ? 1.55 : 1);
      this.maxHp = d.hp * mul.hp * mods.enemyHp * (elite ? 10 : 1) * ero.hp;
      this.hp = this.maxHp;
      this.speed = d.speed * mul.speed * (elite ? 0.9 : 1);
      this.dmg = d.dmg * mul.dmg * mods.enemyDmg * (elite ? 1.5 : 1) * ero.dmg;
      this.xp = d.xp * (elite ? 12 : 1);
      this.baseColor = d.color;
      this.ai = d.ai;
      this.sides = d.sides || 6;
      this.fireT = (d.fireCd || 2) * rnd(1.2, 0.5);
      this.burst = 0;
      this.rings = 0;
      this.aimed = 0;
      this.summons = 0;
      this.life = d.life || 0;
    }

    this.def = d;
    this.x = x;
    this.y = y;

    this.flash = 0;
    this.dead = false;
    this.slow = 0;
    this.slowT = 0;
    this.vuln = 0;
    this.vulnT = 0;
    this.dots = [];
    this.hitTimers = Object.create(null);
    this.touchCd = 0;

    this.rot = rnd(TAU);
    this.wob = rnd(TAU);
    this.t = 0;

    // 每只怪有自己偏向的包围点, 避免全部挤到玩家脚下成一坨
    this.offA = rnd(TAU);
    this.offR = d.r + rnd(110, 20);
  }

  get color() {
    if (this.flash > 0) return '#ffffff';
    return this.elite ? '#ffe066' : this.baseColor;
  }

  update(dt, g) {
    const p = g.player;
    this.t += dt;
    this.rot += dt * (this.boss ? 0.5 : 1.4);

    if (this.flash > 0) this.flash -= dt;
    if (this.castT > 0) this.castT -= dt;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
    if (this.vulnT > 0) { this.vulnT -= dt; if (this.vulnT <= 0) this.vuln = 0; }
    for (const k in this.hitTimers) {
      this.hitTimers[k] -= dt;
      if (this.hitTimers[k] <= 0) delete this.hitTimers[k];
    }

    const sp = this.speed * (this.slow > 0 ? 1 - this.slow : 1);
    const d = dist(this.x, this.y, p.x, p.y);

    // 包围目标点: 远时按各自方位散开, 近了直扑玩家 (Boss 永远直冲)
    let tx = p.x, ty = p.y;
    if (!this.boss) {
      const k = clamp((d - 110) / 170, 0, 1);
      tx += Math.cos(this.offA) * this.offR * k;
      ty += Math.sin(this.offA) * this.offR * k;
    }
    const ang = angTo(this.x, this.y, tx, ty);

    switch (this.ai) {
      case 'erratic': {
        const wob = Math.sin(this.t * 7 + this.wob) * 0.55;
        this.x += Math.cos(ang + wob) * sp * dt;
        this.y += Math.sin(ang + wob) * sp * dt;
        break;
      }
      case 'ranged': {
        this.fireT -= dt;
        // 玩家正面压上来时不再倒退逃跑：只侧移/站桩对射。
        // lastMove 是归一化移动方向；dot > 0.35 视为“朝这只怪前进”。
        const invD = 1 / Math.max(d, 1);
        const closing = p.moving &&
          (p.lastMove.x * (this.x - p.x) + p.lastMove.y * (this.y - p.y)) * invD > 0.35;
        if (d > 280) {
          this.x += Math.cos(ang) * sp * dt;
          this.y += Math.sin(ang) * sp * dt;
        } else if (d < 190 && !closing) {
          this.x -= Math.cos(ang) * sp * 0.9 * dt;
          this.y -= Math.sin(ang) * sp * 0.9 * dt;
        } else {
          const side = ang + Math.PI / 2 * (this.wob > Math.PI ? 1 : -1);
          const sideSp = closing ? 0.32 : 0.6;
          this.x += Math.cos(side) * sp * sideSp * dt;
          this.y += Math.sin(side) * sp * sideSp * dt;
        }
        if (this.fireT <= 0) {
          this.fireT = (this.def.fireCd || 3.6) * rnd(1.15, 0.85);
          this.castT = 0.22;
          this.castStyle = 'hex';
          this.castA = ang;
          g.spawnEnemyBullet(this.x, this.y, ang, this.def.bulletSpeed || 188, this.dmg * 0.7, 6, '#ffa94d', 'hex');
          Sfx.play('shoot');
        }
        break;
      }
      case 'boss': {
        this.burstT -= dt;
        this.aimedT -= dt;
        this.summonT -= dt;
        this.mechT -= dt;

        // 4~5 阶 Boss 的狂暴: 55s(5 阶) / 65s(4 阶) 后回血 + 弹幕加密,
        // 30s 后伤害提高 —— 把「拖到死」变成「必须在这之前打掉」的 DPS 检验。
        if (this.tier >= 4) {
          this.aliveT += dt;
          const lim = (this.tier >= 5 ? 70 : 85) * ((g.mods && g.mods.enrageMul) || 1);
          this.enrageLim = lim;
          if (!this.enraged && this.aliveT > lim) {
            this.enraged = true;
            g.announce(this.name + ' · 狂暴');
            FX.ring(this.x, this.y, this.r + 44, '#ff6b8b', 0.9);
            VFX.slam(this.x, this.y, 170, 'blood', '#ff6b8b', { debris: 22 });
            g.cam.shake = Math.min(28, g.cam.shake + 12);
            Sfx.play('quake');
          }
          if (this.enraged) {
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.008 * dt);
            this.burstEvery = Math.max(0.9, this.baseBurstEvery * 0.7);
            this.summonEvery = Math.max(3.5, this.baseSummonEvery * 0.8);
            if (!this.frenzied && this.aliveT > lim + 40) {
              this.frenzied = true;
              this.dmg = this.baseDmg * 1.25;
              g.announce(this.name + ' · 深渊沸腾');
              Sfx.play('boss');
            }
          }
        }

        if (this.windup > 0) {
          // 特色机制前摇：站定蓄力，给玩家反应时间
          this.windup -= dt;
          if (this.windup <= 0) this.executeMechanic(g, p);
        } else if (this.chargeT > 0) {
          // 野猪王冲锋：沿蓄力方向直线突进
          this.chargeT -= dt;
          this.x += this.chargeVx * dt;
          this.y += this.chargeVy * dt;
        } else {
          if (d > 130) {
            this.x += Math.cos(ang) * sp * dt;
            this.y += Math.sin(ang) * sp * dt;
          } else {
            const side = ang + Math.PI / 2;
            this.x += Math.cos(side) * sp * 0.7 * dt;
            this.y += Math.sin(side) * sp * 0.7 * dt;
          }

          if (this.mechanic && this.mechT <= 0) {
            this.mechT = this.mechEvery;
            this.beginMechanic(g, p);
          }

          if (this.burstT <= 0) {
            this.burstT = this.burstEvery;
            const n = this.burst;
            const rings = Math.max(1, this.rings);
            this.castT = 0.24;
            this.castStyle = 'abyss';
            this.castA = this.rot;
            for (let r = 0; r < rings; r++) {
              for (let i = 0; i < n; i++) {
                const a = r * TAU / (n * rings) + i * TAU / n + this.rot;
                g.spawnEnemyBullet(this.x, this.y, a, 150 + this.tier * 6,
                  this.dmg * 0.6, 7, this.baseColor, 'abyss');
              }
            }
            FX.ring(this.x, this.y, this.r + 8, this.baseColor, 0.5);
            Sfx.play('boss');
          }

          if (this.aimed > 0 && this.aimedT <= 0) {
            this.aimedT = this.aimedEvery;
            const base = angTo(this.x, this.y, p.x, p.y);
            this.castT = 0.2;
            this.castStyle = 'void';
            this.castA = base;
            for (let i = 0; i < this.aimed; i++) {
              const a = base + (i - (this.aimed - 1) / 2) * 0.14;
              g.spawnEnemyBullet(this.x, this.y, a, 230, this.dmg * 0.5, 6, '#d0bfff', 'void');
            }
            Sfx.play('shoot');
          }

          if (this.summonT <= 0) {
            this.summonT = this.summonEvery;
            for (let i = 0; i < this.summons; i++) {
              if (g.enemies.length >= CONTENT.maxEnemies) break;
              const a = rnd(TAU);
              const type = this.summonType || pick(['bat', 'skeleton']);
              g.spawnEnemy(type,
                this.x + Math.cos(a) * 80, this.y + Math.sin(a) * 80, false);
            }
            FX.ring(this.x, this.y, this.r + 22, this.baseColor, 0.45);
          }
        }
        break;
      }
      case 'totem': {
        // 巫毒图腾：原地站桩，定时朝玩家放暗影弹，寿命到了自动消失
        this.life -= dt;
        this.fireT -= dt;
        if (this.life <= 0) {
          this.dead = true;
          this.hp = 0;
          FX.ring(this.x, this.y, this.r + 10, this.baseColor, 0.35);
          break;
        }
        if (this.fireT <= 0) {
          this.fireT = this.def.fireCd || 1.6;
          const a = angTo(this.x, this.y, p.x, p.y);
          this.castT = 0.2;
          this.castStyle = 'hex';
          this.castA = a;
          g.spawnEnemyBullet(this.x, this.y, a,
            this.def.bulletSpeed || 220, this.def.bulletDmg || 9, 6, '#c77dff', 'hex');
          Sfx.play('shoot');
        }
        break;
      }
      default: {
        this.x += Math.cos(ang) * sp * dt;
        this.y += Math.sin(ang) * sp * dt;
      }
    }

    // 世界边界
    const W = CONTENT.world;
    this.x = clamp(this.x, this.r, W.w - this.r);
    this.y = clamp(this.y, this.r, W.h - this.r);

    // 贴身伤害(有护体帧)；冲锋命中额外加成
    const dNow = dist(this.x, this.y, p.x, p.y);
    if (this.dmg > 0 && dNow < this.r + p.r && p.iframe <= 0 && p.invuln <= 0) {
      p.hurt(this.dmg * (this.chargeT > 0 ? 1.15 : 1), g);
    }
  }

  /* Boss 特色机制：前摇开始 */
  beginMechanic(g, p) {
    const k = this.mechanic;
    if (k === 'charge') {
      this.windup = 0.65;
      this.windupKind = 'charge';
      this.chargeA = angTo(this.x, this.y, p.x, p.y);
      FX.bolt(this.x, this.y,
        this.x + Math.cos(this.chargeA) * 240,
        this.y + Math.sin(this.chargeA) * 240,
        this.baseColor, 0.55);
      VFX.shock(this.x, this.y, this.r + 14, 'gold', this.baseColor, { heavy: true, life: 0.55 });
      FX.ring(this.x, this.y, this.r + 10, this.baseColor, 0.45);
      Sfx.play('boss');
    } else if (k === 'breath') {
      this.windup = 0.55;
      this.windupKind = 'breath';
      const a = angTo(this.x, this.y, p.x, p.y);
      this.breathA = a;
      FX.arc(this.x, this.y, this.r + 26, a - 0.35, a + 0.35, '#ff7b5d', 0.55);
      VFX.cone(this.x, this.y, a, this.r * 2.2, 0.7, 'dragon', '#ff7b5d', { life: 0.45 });
      Sfx.play('boss');
    } else if (k === 'poison') {
      const r = this.def.poisonR || 120;
      g.zones.push(new Zone({
        x: p.x, y: p.y, r, kind: 'field', hostile: true,
        duration: this.def.poisonDuration || 6, tick: 0.6,
        dps: this.dmg * (this.def.poisonMul || 0.25),
        color: '#8ce99a', id: 'boss_poison', art: 'boss_poison', style: 'poison'
      }));
      VFX.cast(p.x, p.y, r * 0.7, 'poison', '#8ce99a', { life: 0.65 });
      FX.ring(p.x, p.y, r, '#8ce99a', 0.45);
      Sfx.play('shoot');
    } else if (k === 'firerain') {
      const n = this.def.meteorCount || 3;
      for (let i = 0; i < n; i++) {
        const a = rnd(TAU);
        const rad = rnd(70, 10);
        const mx = p.x + Math.cos(a) * rad;
        const my = p.y + Math.sin(a) * rad;
        g.zones.push(new Zone({
          x: mx, y: my,
          r: this.def.meteorR || 85, kind: 'burst', hostile: true,
          delay: 0.85 + i * 0.14,
          dmg: this.dmg * (this.def.meteorMul || 0.55),
          color: '#ff8c42', id: 'boss_meteor', art: 'boss_meteor', style: 'fire'
        }));
        VFX.cast(mx, my, (this.def.meteorR || 85) * 0.6, 'fire', '#ff8c42', { life: 0.5 });
      }
      FX.ring(p.x, p.y, this.def.meteorR || 85, '#ff8c42', 0.5);
      Sfx.play('boss');
    } else if (k === 'totem') {
      const n = this.def.totemCount || 2;
      for (let i = 0; i < n; i++) {
        if (g.enemies.length >= CONTENT.maxEnemies) break;
        const a = rnd(TAU);
        const rad = rnd(95, 55);
        const tx = this.x + Math.cos(a) * rad;
        const ty = this.y + Math.sin(a) * rad;
        g.spawnEnemy('totem', tx, ty, false);
        VFX.cast(tx, ty, 44, 'hex', '#c77dff', { life: 0.6 });
      }
      FX.ring(this.x, this.y, this.r + 30, '#c77dff', 0.5);
      Sfx.play('boss');
    }
  }

  /* Boss 特色机制：前摇结束，真正生效 */
  executeMechanic(g, p) {
    if (this.windupKind === 'charge') {
      this.chargeT = this.def.chargeTime || 0.42;
      const sp = this.def.chargeSpeed || 560;
      this.chargeVx = Math.cos(this.chargeA) * sp;
      this.chargeVy = Math.sin(this.chargeA) * sp;
      FX.spark(this.x, this.y, this.baseColor, 10, 180, 0.4, 3);
      VFX.shock(this.x, this.y, this.r + 26, 'gold', this.baseColor, { heavy: true, life: 0.4 });
      VFX.dust(this.x, this.y, 'gold', this.baseColor, { life: 0.5 });
      Sfx.play('boss');
    } else if (this.windupKind === 'breath') {
      const base = this.breathA == null ? angTo(this.x, this.y, p.x, p.y) : this.breathA;
      const n = this.def.breathCount || 9;
      const spread = this.def.breathSpread || 0.7;
      VFX.cone(this.x, this.y, base, this.r * 4.6, Math.max(0.8, spread + 0.25),
        'dragon', '#ff7b5d', { life: 0.6 });
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) / Math.max(1, n - 1) * spread;
        g.spawnEnemyBullet(this.x, this.y, a, 240,
          this.dmg * (this.def.breathMul || 0.40), 7, '#ff7b5d', 'dragon');
      }
      this.breathA = null;
      FX.ring(this.x, this.y, this.r + 18, '#ff7b5d', 0.45);
      g.cam.shake = Math.min(18, g.cam.shake + 4);
      Sfx.play('boss');
    }
    this.windupKind = '';
    this.mechT = this.mechEvery;
  }
}

class Projectile {
  constructor(o) {
    this.x = o.x; this.y = o.y;
    this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.r = o.r || 5;
    this.dmg = o.dmg || 10;
    this.pierce = o.pierce || 0;
    this.life = o.life || 2.2;
    this.color = o.color || '#7df';
    this.hostile = !!o.hostile;
    this.aoe = o.aoe || 0;
    this.homing = o.homing || 0;
    this.target = o.target || null;
    this.speed = o.speed || 0;
    this.slow = o.slow || 0;
    this.slowT = o.slowT || 0;
    this.dead = false;
    this.hits = new Set();
    this.trail = [];
    this.spin = 0;
    this.type = o.type || 'bolt';
    this.art = o.art || '';          // 技能 id / 弹体美术 key
    this.style = o.style || '';      // fire / ice / arcane / shadow / ...
    this.age = 0;
  }

  update(dt, g) {
    this.age += dt;
    if (this.homing > 0) {
      if (!this.target || this.target.dead) this.target = g.nearestEnemy(this.x, this.y, 520);
      if (this.target) {
        const want = angTo(this.x, this.y, this.target.x, this.target.y);
        const cur = Math.atan2(this.vy, this.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const na = cur + clamp(diff, -this.homing * dt, this.homing * dt);
        const sp = this.speed;
        this.vx = Math.cos(na) * sp;
        this.vy = Math.sin(na) * sp;
      }
    }

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.spin += dt * 12;

    if (this.life <= 0) this.dead = true;

    const W = CONTENT.world;
    if (this.x < -120 || this.y < -120 || this.x > W.w + 120 || this.y > W.h + 120) this.dead = true;
  }
}

class Gem {
  constructor(x, y, value, heal, gold) {
    this.x = x;
    this.y = y;
    this.value = value;
    this.heal = heal || 0;
    this.gold = !!gold;
    this.r = this.gold ? 6 : (heal ? 8 : 5);
    this.vx = rnd(70, -70);
    this.vy = rnd(70, -70);
    this.dead = false;
    this.pull = false;
    this.age = 0;
    this.t = rnd(TAU);
  }

  update(dt, g) {
    const p = g.player;
    this.t += dt * 4;
    this.age += dt;
    const d = dist(this.x, this.y, p.x, p.y);

    if (d < p.magnet) this.pull = true;

    // 掉地上超过 2.5 秒会自己慢慢飘向玩家, 避免经验全都落在身后
    if (!this.pull && this.age > 2.5) {
      const a = angTo(this.x, this.y, p.x, p.y);
      this.x += Math.cos(a) * 95 * dt;
      this.y += Math.sin(a) * 95 * dt;
    }

    if (this.pull) {
      const a = angTo(this.x, this.y, p.x, p.y);
      const sp = 340 + Math.max(0, 260 - d) * 2.4;
      this.x += Math.cos(a) * sp * dt;
      this.y += Math.sin(a) * sp * dt;
      if (d < p.r + 10) {
        this.dead = true;
        if (this.gold) {
          g.collectGold(this.value);
        } else if (this.heal) {
          p.heal(this.heal);
          FX.text(p.x, p.y - 26, '+' + this.heal, '#5be08a', 14, 0.7);
        } else {
          g.gainXp(this.value);
        }
        if (!this.gold) Sfx.play('pick');
      }
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.9;
      this.vy *= 0.9;
    }
  }
}

/* 地面区域: 暴风雪/烈焰风暴 */
class Zone {
  constructor(o) {
    this.x = o.x;
    this.y = o.y;
    this.r = o.r || 110;
    this.kind = o.kind || 'field';
    this.duration = o.duration || 0;
    this.tick = o.tick || 0.5;
    this.dps = o.dps || 0;
    this.dmg = o.dmg || 0;
    this.delay = o.delay || 0;
    this.slow = o.slow || 0;
    this.slowT = o.slowT || 0;
    this.color = o.color || '#74c0fc';
    this.id = o.id || 'zone';
    this.art = o.art || '';          // blizzard / flamestrike / boss_poison / boss_meteor
    this.style = o.style || '';      // fire / ice / poison / ...
    this.seed = Math.random() * 100;
    this.hostile = !!o.hostile;
    this.t = 0;
    this.tickT = this.hostile ? this.tick : 0;
    this.burstDone = false;
    this.dead = false;
  }

  update(dt, g) {
    this.t += dt;

    if (this.kind === 'burst') {
      if (!this.burstDone && this.t >= this.delay) {
        this.burstDone = true;
        this.dead = true;
        const fx = this.style || 'fire';
        const heavy = this.r >= 95 || this.hostile;
        VFX.burst(this.x, this.y, this.r, fx, this.color, {
          heavy, life: heavy ? 0.72 : 0.55
        });
        VFX.shock(this.x, this.y, this.r * 0.9, fx, this.color, { heavy });
        FX.spark(this.x, this.y, this.color, 20, 260, 0.55);
        g.cam.shake = Math.min(18, g.cam.shake + (heavy ? 4 : 1.5));
        Sfx.play('hit');
        if (this.hostile) {
          const pl = g.player;
          if (pl && dist2(this.x, this.y, pl.x, pl.y) <= (this.r + pl.r) * (this.r + pl.r)) {
            pl.hurt(this.dmg, g);
          }
        } else {
          const near = [];
          g.grid.query(this.x, this.y, this.r + 60, near);
          for (let i = 0; i < near.length; i++) {
            const e = near[i];
            if (e.dead) continue;
            if (dist2(this.x, this.y, e.x, e.y) > (this.r + e.r) * (this.r + e.r)) continue;
            damageEnemy(g, e, this.dmg, { color: this.color });
          }
        }
      }
      return;
    }

    if (this.t > this.duration) { this.dead = true; return; }

    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = this.tick;
      if (this.hostile) {
        const pl = g.player;
        if (pl && dist2(this.x, this.y, pl.x, pl.y) <= (this.r + pl.r) * (this.r + pl.r)) {
          pl.hurt(this.dps * this.tick, g);
        }
      } else {
        const near = [];
        g.grid.query(this.x, this.y, this.r + 60, near);
        for (let i = 0; i < near.length; i++) {
          const e = near[i];
          if (e.dead) continue;
          if (dist2(this.x, this.y, e.x, e.y) > (this.r + e.r) * (this.r + e.r)) continue;
          if (this.slow) {
            e.slow = Math.max(e.slow, this.slow);
            e.slowT = Math.max(e.slowT, this.slowT);
          }
          if (this.dps) damageEnemy(g, e, this.dps * this.tick, { quiet: true, silent: true, color: this.color });
        }
      }
    }
  }
}
