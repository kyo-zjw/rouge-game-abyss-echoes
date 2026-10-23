/* 单元测试 v0.2: 职业 / 技能 / 5 阶 Boss / 难度 / 升级 / 拾取 / 存档
   运行: node test/unit.js  */

'use strict';

const { createHarness } = require('./harness');

let passed = 0;
const fails = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    fails.push(name + ': ' + err.message);
    console.log('  ✗ ' + name + ' → ' + err.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

function near(a, b, eps) {
  return Math.abs(a - b) < (eps || 1e-6);
}

/* ============ 1. 职业 ============ */
console.log('\n[职业]');
{
  const h = createHarness();
  const g = h.game;

  check('默认开局是战士，基础数值与起始技能正确', () => {
    h.run('GAME.start();');
    assert(g.player.classId === 'warrior', '职业不是 warrior: ' + g.player.classId);
    assert(g.player.maxHp === 170, '战士最大生命错误: ' + g.player.maxHp);
    assert(near(g.player.speed, 168), '战士移速错误: ' + g.player.speed);
    assert(near(g.player.armor, 0.12), '战士护甲错误: ' + g.player.armor);
    assert(g.player.skills.length === 1, '起始技能数量错误: ' + g.player.skills.length);
    assert(g.player.skills[0].id === 'heroic_strike', '起始技能不是英勇打击: ' + g.player.skills[0].id);
  });

  check('法师基础数值与起始技能正确', () => {
    h.run('GAME.start("mage", "normal");');
    assert(g.player.classId === 'mage', '职业不是 mage');
    assert(g.player.maxHp === 110, '法师最大生命错误: ' + g.player.maxHp);
    assert(near(g.player.speed, 184), '法师移速错误');
    assert(near(g.player.dmgMul, 1.10), '法师伤害倍率错误: ' + g.player.dmgMul);
    assert(near(g.player.cdMul, 0.95), '法师冷却倍率错误: ' + g.player.cdMul);
    assert(g.player.skills[0].id === 'fireball', '起始技能不是火球术');
  });

  check('两职业各 15 个技能，且 30 个技能都有 5 级和 4 条升级文案', () => {
    const data = h.run(`(() => {
      const out = [];
      for (const cid in CONTENT.classes) {
        const c = CONTENT.classes[cid];
        let ok = c.skills.length === 15;
        let levels = true, ups = true, exists = true;
        for (const id of c.skills) {
          const d = CONTENT.skills[id];
          if (!d) { exists = false; continue; }
          if (d.lvl.length !== 5) levels = false;
          if (!d.up || d.up.length !== 4) ups = false;
          if (d.cls !== cid) out.push('职业标记错误 ' + id);
        }
        out.push({ cid: cid, count: c.skills.length, ok: ok, levels: levels, ups: ups, exists: exists });
      }
      const all = Object.keys(CONTENT.skills);
      return { classes: out, total: all.length };
    })()`);
    assert(data.total === 30, '技能总数不是 30: ' + data.total);
    for (const c of data.classes) {
      assert(c.count === 15, c.cid + ' 技能数不是 15: ' + c.count);
      assert(c.ok && c.exists, c.cid + ' 技能列表有缺失');
      assert(c.levels, c.cid + ' 有技能不是 5 级');
      assert(c.ups, c.cid + ' 有技能缺升级文案');
    }
  });

  check('技能槽最多 5 个，已有技能重复获得只升级', () => {
    h.run(`
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.skills.length = 0;
      const ids = CONTENT.classes.warrior.skills;
      for (let i = 0; i < ids.length; i++) p.addSkill(ids[i]);
      for (let i = 0; i < 30; i++) p.addSkill(ids[0]);
    `);
    assert(g.player.skills.length === 5, '技能槽超过 5: ' + g.player.skills.length);
    assert(g.player.skill('heroic_strike').lvl === 5, '起始技能没有升到 5 级');
  });
}

/* ============ 2. 技能行为 ============ */
console.log('\n[技能行为]');
{
  const h = createHarness();
  const g = h.game;

  check('30 个技能都能自动施放，更新 2 秒不报错', () => {
    const res = h.run(`(() => {
      const out = [];
      for (const cid in CONTENT.classes) {
        for (const id of CONTENT.classes[cid].skills) {
          try {
            GAME.start(cid, 'normal');
            GAME.autoplay = false;
            const p = GAME.player;
            p.skills.length = 0;
            p.addSkill(id);
            p.skill(id).lvl = 5;
            p.iframe = 999;
            GAME.enemies.length = 0;
            GAME.zones.length = 0;
            GAME.projectiles.length = 0;
            GAME.gems.length = 0;
            GAME.spawner.opened = true;
            GAME.spawner.spawnT = 999;
            GAME.spawner.eliteT = 999;
            for (let i = 0; i < 6; i++) {
              const a = i / 6 * TAU;
              const e = GAME.spawnEnemy('brute', p.x + Math.cos(a) * 110, p.y + Math.sin(a) * 110, false);
              e.hp = e.maxHp = 99999;
            }
            for (let i = 0; i < 120; i++) GAME.update(1 / 60);
            out.push({ id: id, ok: true });
          } catch (err) {
            out.push({ id: id, ok: false, error: err.stack || String(err) });
          }
        }
      }
      return out;
    })()`);
    assert(res.length === 30, '没有覆盖 30 个技能: ' + res.length);
    for (const r of res) assert(r.ok, r.id + ' 施放报错: ' + r.error);
  });

  check('近战扇形命中并造成伤害', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.skills.length = 0; p.addSkill('heroic_strike'); p.skill('heroic_strike').lvl = 5;
      p.iframe = 999;
      GAME.enemies.length = 0; GAME.spawner.opened = true; GAME.spawner.spawnT = 999;
      const e = GAME.spawnEnemy('brute', p.x + 80, p.y, false);
      e.hp = e.maxHp = 99999;
      for (let i = 0; i < 120; i++) GAME.update(1 / 60);
      return { dmg: p.damageDealt, hp: e.hp, max: e.maxHp };
    })()`);
    assert(out.dmg > 0, '英勇打击没有造成伤害');
    assert(out.hp < out.max, '目标没有掉血');
  });

  check('投射物 / 自身 AOE / 地面 AOE / 连锁都能造成伤害', () => {
    const out = h.run(`(() => {
      const test = (cls, id, dx) => {
        GAME.start(cls, 'normal');
        const p = GAME.player;
        p.skills.length = 0; p.addSkill(id); p.skill(id).lvl = 5;
        p.iframe = 999;
        GAME.enemies.length = 0; GAME.zones.length = 0; GAME.projectiles.length = 0;
        GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
        for (let i = 0; i < 4; i++) {
          const e = GAME.spawnEnemy('brute', p.x + dx + i * 18, p.y + i * 18, false);
          e.hp = e.maxHp = 99999;
        }
        for (let i = 0; i < 180; i++) GAME.update(1 / 60);
        return p.damageDealt;
      };
      return {
        projectile: test('mage', 'fireball', 180),
        pbaoe: test('warrior', 'whirlwind', 40),
        ground: test('mage', 'blizzard', 120),
        chain: test('mage', 'arcane_torrent', 100)
      };
    })()`);
    for (const k in out) assert(out[k] > 0, k + ' 没有造成伤害');
  });

  check('增益 / 护盾 / 无敌生效', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.skills.length = 0;
      p.addSkill('battle_shout'); p.addSkill('shield_wall');
      p.skill('battle_shout').lvl = 5; p.skill('shield_wall').lvl = 5;
      const base = p.dmgMul;
      GAME.enemies.length = 0; GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      GAME.spawnEnemy('slime', p.x + 200, p.y, false);
      for (let i = 0; i < 120; i++) GAME.update(1 / 60);
      const buffed = p.dmgMul;
      const shield = p.shield;
      p.iframe = 0;
      const hp0 = p.hp;
      p.hurt(100, GAME);
      return { base: base, buffed: buffed, shield: shield, hp0: hp0, hp1: p.hp };
    })()`);
    assert(out.buffed > out.base, '战斗怒吼没有提升伤害: ' + out.base + ' → ' + out.buffed);
    assert(out.shield > 0, '盾墙没有产生护盾');
    assert(out.hp1 === out.hp0, '护盾/无敌没有挡住伤害');
  });

  check('流血 DoT 能持续造成伤害', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.skills.length = 0; p.addSkill('rend'); p.skill('rend').lvl = 5;
      p.iframe = 999;
      GAME.enemies.length = 0; GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      const e = GAME.spawnEnemy('brute', p.x + 80, p.y, false);
      e.hp = e.maxHp = 99999;
      for (let i = 0; i < 60; i++) GAME.update(1 / 60);
      const dots = e.dots.length;
      const hp0 = e.hp;
      for (let i = 0; i < 120; i++) GAME.update(1 / 60);
      return { dots: dots, hp0: hp0, hp1: e.hp };
    })()`);
    assert(out.dots > 0, '没有挂上流血');
    assert(out.hp1 < out.hp0, '流血没有继续掉血');
  });

  check('处决增伤 / 易伤增伤正确', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.iframe = 999;
      const a = GAME.spawnEnemy('brute', p.x + 300, p.y + 300, false);
      a.maxHp = 1000; a.hp = 300;
      const h0 = a.hp;
      damageEnemy(GAME, a, 100, { execute: { threshold: 0.4, mult: 2 }, quiet: true, silent: true });
      const executeDmg = h0 - a.hp;
      const b = GAME.spawnEnemy('brute', p.x - 300, p.y + 300, false);
      b.hp = b.maxHp = 1000; b.vuln = 0.5;
      const h1 = b.hp;
      damageEnemy(GAME, b, 100, { quiet: true, silent: true });
      return { executeDmg: executeDmg, vulnDmg: h1 - b.hp, dmgMul: p.dmgMul };
    })()`);
    assert(near(out.executeDmg, 200, 1e-3), '处决伤害不是 200: ' + out.executeDmg);
    assert(near(out.vulnDmg, 150, 1e-3), '易伤伤害不是 150: ' + out.vulnDmg);
  });

  check('冲锋/闪现会自动位移', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.skills.length = 0; p.addSkill('charge'); p.skill('charge').lvl = 5;
      p.iframe = 999;
      GAME.enemies.length = 0; GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      GAME.spawnEnemy('brute', p.x + 260, p.y, false);
      const x0 = p.x;
      for (let i = 0; i < 30; i++) GAME.update(1 / 60);
      const warriorMoved = Math.abs(p.x - x0);

      GAME.start('mage', 'normal');
      const p2 = GAME.player;
      p2.skills.length = 0; p2.addSkill('blink'); p2.skill('blink').lvl = 5;
      p2.iframe = 999;
      GAME.enemies.length = 0; GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      GAME.spawnEnemy('brute', p2.x + 80, p2.y, false);
      const x1 = p2.x, y1 = p2.y;
      for (let i = 0; i < 30; i++) GAME.update(1 / 60);
      return { warriorMoved: warriorMoved, mageMoved: Math.hypot(p2.x - x1, p2.y - y1) };
    })()`);
    assert(out.warriorMoved > 40, '冲锋没有位移: ' + out.warriorMoved);
    assert(out.mageMoved > 40, '闪现没有位移: ' + out.mageMoved);
  });

  check('胜利在望击杀回血', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.skills.length = 0; p.addSkill('victory_rush'); p.skill('victory_rush').lvl = 5;
      p.hp = 50;
      GAME.enemies.length = 0; GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      const e = GAME.spawnEnemy('slime', p.x + 40, p.y, false);
      damageEnemy(GAME, e, 9999, { quiet: true, silent: true });
      return { hp: p.hp };
    })()`);
    assert(out.hp > 50, '击杀后没有回血: ' + out.hp);
  });
}

/* ============ 3. 位移 / 远程 AI ============ */
console.log('\n[位移与远程 AI]');
{
  const h = createHarness();

  check('空格朝鼠标冲锋，2 层充能，逐层恢复', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.iframe = 999;
      GAME.enemies.length = 0;
      GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      Input.mouse.moved = true;
      Input.mouse.x = GAME.view.w / 2 + 320;
      Input.mouse.y = GAME.view.h / 2;
      const x0 = p.x;
      Input.pressed.Space = true;
      GAME.update(1 / 60);
      const cast = { charges: p.displacement.charges, max: p.displacement.max, dashing: !!p.dash };
      for (let i = 0; i < 30; i++) GAME.update(1 / 60);
      const moved = p.x - x0;
      const ended = !p.dash;
      for (let i = 0; i < 450; i++) p.tickDisplacement(1 / 60);
      const recharged = p.displacement.charges;
      return { cast, moved, ended, recharged };
    })()`);
    assert(out.cast.max === 2, '冲锋充能上限不是 2');
    assert(out.cast.charges === 1, '第一次冲锋后应剩 1 层: ' + out.cast.charges);
    assert(out.cast.dashing, '冲锋没有进入冲刺状态');
    assert(out.moved > 120, '冲锋没有明显位移: ' + out.moved);
    assert(out.ended, '冲锋没有在冲刺结束后停止');
    assert(out.recharged === 2, '冲锋没有恢复第二层: ' + out.recharged);
  });

  check('法师闪现是瞬移，且位移技能不再进入升级卡池', () => {
    const out = h.run(`(() => {
      GAME.start('mage', 'normal');
      const p = GAME.player;
      p.iframe = 999;
      GAME.enemies.length = 0;
      GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      Input.mouse.moved = true;
      Input.mouse.x = GAME.view.w / 2 + 260;
      Input.mouse.y = GAME.view.h / 2;
      const x0 = p.x;
      Input.pressed.Space = true;
      GAME.update(1 / 60);
      const blink = { moved: p.x - x0, dashing: !!p.dash, charges: p.displacement.charges };

      GAME.start('mage', 'normal');
      GAME.player.skills.length = 0;
      let offered = false;
      for (let i = 0; i < 120; i++) {
        const list = rollOffers(GAME.player, 3);
        for (const o of list) if (o.id === 'blink' || o.id === 'charge') offered = true;
      }
      return { blink, offered };
    })()`);
    assert(out.blink.moved > 120, '闪现没有位移: ' + out.blink.moved);
    assert(!out.blink.dashing, '闪现不应进入持续冲刺状态');
    assert(out.blink.charges === 1, '闪现后应剩 1 层');
    assert(!out.offered, '冲锋/闪现不应再出现在升级卡池');
  });

  check('远程小怪在玩家正面推进时不再后退逃跑', () => {
    const out = h.run(`(() => {
      GAME.start('mage', 'normal');
      const p = GAME.player;
      p.iframe = 999;
      GAME.enemies.length = 0;
      GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      const e = GAME.spawnEnemy('shooter', p.x + 170, p.y, false);
      const ex = e.x, d0 = Math.hypot(e.x - p.x, e.y - p.y);
      Input.keys = { KeyD: true };
      for (let i = 0; i < 30; i++) GAME.update(1 / 60);
      return { dx: e.x - ex, d0: d0, d1: Math.hypot(e.x - p.x, e.y - p.y) };
    })()`);
    assert(out.dx < 4, '玩家前进时远程怪仍在后退: ' + out.dx);
    assert(out.d1 < out.d0, '玩家前进时距离没有拉近: ' + out.d0 + ' -> ' + out.d1);
  });
}

/* ============ 4. 动画与特效 ============ */
console.log('\n[动画与特效]');
{
  const h = createHarness();

  check('玩家攻击姿态会随时间推进并自动结束', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.triggerAttack('strike', 0, 'heroic_strike', { style: 'gold' });
      const pose = p.animPose();
      const before = {
        kind: p.attack && p.attack.kind,
        style: p.attack && p.attack.style,
        poseFinite: [pose.bob, pose.rot, pose.sx, pose.sy, pose.lunge, pose.lift].every(v => isFinite(v))
      };
      GAME.update(1 / 60);
      const mid = p.attack ? p.attack.t : -1;
      for (let i = 0; i < 90; i++) GAME.update(1 / 60);
      return { before, mid, after: p.attack };
    })()`);
    assert(out.before.kind === 'strike', '没有进入近战出招姿态: ' + out.before.kind);
    assert(out.before.style === 'gold', '出招风格没有传递: ' + out.before.style);
    assert(out.before.poseFinite, '姿态出现 NaN');
    assert(out.mid > 0, '出招计时没有推进');
    assert(!out.after, '出招姿态没有自动结束');
  });

  check('技能施放驱动动画, 弹体/区域带特效风格', () => {
    const out = h.run(`(() => {
      GAME.start('mage', 'normal');
      const p = GAME.player;
      p.invuln = 999;
      p.skills.length = 0;
      p.addSkill('fireball');
      const kinds = [];
      const orig = p.triggerAttack.bind(p);
      p.triggerAttack = function (kind, angle, id, opt) {
        kinds.push(kind);
        return orig(kind, angle, id, opt);
      };
      GAME.enemies.length = 0;
      GAME.spawner.opened = true;
      GAME.spawner.spawnT = 999;
      GAME.spawner.eliteT = 999;
      const e = GAME.spawnEnemy('slime', p.x + 400, p.y, false);
      e.hp = e.maxHp = 1e9;
      e.speed = 0;
      e.dmg = 0;
      for (let i = 0; i < 20; i++) GAME.update(1 / 60);
      const fire = GAME.projectiles.find(pr => pr.art === 'fireball');

      GAME.projectiles.length = 0;
      p.skills.length = 0;
      p.addSkill('blizzard');
      for (let i = 0; i < 5; i++) {
        const s = GAME.spawnEnemy('slime', p.x + 80 + i * 10, p.y + i * 6, false);
        s.hp = s.maxHp = 1e9;
        s.speed = 0;
        s.dmg = 0;
      }
      for (let i = 0; i < 40; i++) GAME.update(1 / 60);
      const bliz = GAME.zones.find(z => z.art === 'blizzard');

      return {
        kinds: kinds,
        fireStyle: fire && fire.style,
        fireArt: fire && fire.art,
        bliz: !!bliz,
        blizStyle: bliz && bliz.style
      };
    })()`);
    assert(out.kinds.indexOf('cast') >= 0, '施法没有触发出招姿态: ' + JSON.stringify(out.kinds));
    assert(out.fireArt === 'fireball' && out.fireStyle === 'fire',
      '火球弹体没有带上特效风格: ' + out.fireArt + '/' + out.fireStyle);
    assert(out.bliz && out.blizStyle === 'ice', '暴风雪区域没有带上冰霜风格');
  });

  check('特效池会更新并自动回收, 全部绘制类型可用', () => {
    const out = h.run(`(() => {
      VFX.reset();
      VFX.slash(100, 100, 0, 60, 1.6, 'gold', '#ffd166', { heavy: true });
      VFX.cone(100, 100, 0, 80, 1.2, 'fire');
      VFX.burst(100, 100, 60, 'ice', '#74c0fc');
      VFX.shock(100, 100, 70, 'thunder');
      VFX.cast(100, 100, 44, 'arcane');
      VFX.aura(100, 100, 40, 'holy');
      VFX.lightning(10, 10, 200, 120, 'thunder');
      VFX.impact(100, 100, 'blood');
      VFX.dust(100, 100, 'gold');
      VFX.breath(100, 100, 0, 160, 1.4, 'dragon', '#ff9f43');
      const count = VFX.items.length;
      VFX.draw(GAME.ctx, 'ground');
      VFX.draw(GAME.ctx, 'over');
      for (let i = 0; i < 180; i++) VFX.update(1 / 60);
      return { count: count, left: VFX.items.length };
    })()`);
    assert(out.count === 11, '特效没有全部创建: ' + out.count);
    assert(out.left === 0, '特效没有自动回收: ' + out.left);
  });

  check('龙息生成地面焦痕与火焰层，能完整绘制', () => {
    const out = h.run(`(() => {
      VFX.reset();
      VFX.breath(100, 100, 0.4, 180, 1.5, 'dragon', '#ff9f43');
      const types = VFX.items.map(i => i.type);
      VFX.update(1 / 60);
      VFX.draw(GAME.ctx, 'ground');
      VFX.draw(GAME.ctx, 'over');
      return { types, layers: VFX.items.map(i => i.layer) };
    })()`);
    assert(out.types.indexOf('breath') >= 0, '龙息缺少火焰层');
    assert(out.types.indexOf('breath_ground') >= 0, '龙息缺少地面焦痕层');
    assert(out.layers.indexOf('ground') >= 0, '龙息地面层没有放在地面层');
  });

  check('暴风雪/烈焰风暴/毒云/陨石区域都能绘制', () => {
    h.run(`
      VFX.reset();
      const zones = [
        { x: 100, y: 100, r: 80, kind: 'field', duration: 5, t: 1, art: 'blizzard', seed: 3, color: '#74c0fc' },
        { x: 100, y: 100, r: 80, kind: 'burst', delay: 0.35, t: 0.2, art: 'flamestrike', seed: 4, color: '#ff9f43' },
        { x: 100, y: 100, r: 90, kind: 'field', duration: 5, t: 1, art: 'boss_poison', seed: 5, color: '#8ce99a' },
        { x: 100, y: 100, r: 85, kind: 'burst', delay: 0.85, t: 0.4, art: 'boss_meteor', seed: 6, color: '#ff8c42' }
      ];
      for (const z of zones) VFX.drawZone(GAME.ctx, z);
    `);
  });

  check('静态展示场能装配法师/战士特效并渲染', () => {
    const out = h.run(`(() => {
      GAME.setupShowcase(1);
      const mage = {
        cls: GAME.player.classId,
        zones: GAME.zones.map(z => z.art),
        proj: GAME.projectiles.length,
        vfx: VFX.items.length,
        enemies: GAME.enemies.length
      };
      GAME.render();
      GAME.setupShowcase(2);
      const warrior = {
        cls: GAME.player.classId,
        zones: GAME.zones.length,
        proj: GAME.projectiles.length,
        vfx: VFX.items.length,
        channel: !!GAME.player.channel,
        boss: GAME.bosses.length
      };
      GAME.render();
      return { mage: mage, warrior: warrior };
    })()`);
    assert(out.mage.cls === 'mage' && out.mage.zones.indexOf('blizzard') >= 0,
      '法师展示场缺少暴风雪');
    assert(out.mage.proj >= 5 && out.mage.vfx >= 4 && out.mage.enemies >= 8,
      '法师展示场元素不足');
    assert(out.warrior.cls === 'warrior' && out.warrior.channel && out.warrior.boss >= 1,
      '战士展示场缺少引导刀光或 Boss');
    assert(out.warrior.proj >= 1 && out.warrior.vfx >= 4,
      '战士展示场元素不足');
  });

  check('龙息展示场只保留龙息与木桩，能完整渲染', () => {
    const out = h.run(`(() => {
      GAME.setupShowcase(3);
      const info = {
        skills: GAME.player.skills.map(s => s.id),
        breath: VFX.items.filter(i => i.type === 'breath').length,
        ground: VFX.items.filter(i => i.type === 'breath_ground').length,
        enemies: GAME.enemies.length,
        zones: GAME.zones.length
      };
      GAME.render();
      return info;
    })()`);
    assert(out.skills.length === 1 && out.skills[0] === 'dragon_breath', '展示场技能不是龙息');
    assert(out.breath === 1 && out.ground === 1, '龙息展示场缺少火焰/焦痕层');
    assert(out.enemies === 3 && out.zones === 0, '龙息展示场木桩或地面区域数量不对');
  });

  check('龙息动态演示会循环施放且不刷波次', () => {
    const out = h.run(`(() => {
      GAME.setupBreathDemo();
      let frames = 0;
      for (let i = 0; i < 240; i++) {
        GAME.update(1 / 60);
        if (VFX.items.some(it => it.type === 'breath')) frames++;
      }
      GAME.render();
      return {
        frames: frames,
        demo: GAME.vfxDemo,
        state: GAME.state,
        enemies: GAME.enemies.length,
        skills: GAME.player.skills.map(s => s.id)
      };
    })()`);
    assert(out.demo && out.state === 'playing', '动态演示没有进入可运行状态');
    assert(out.frames > 30, '龙息没有循环播放: ' + out.frames);
    assert(out.enemies === 3, '动态演示不应该刷小怪: ' + out.enemies);
    assert(out.skills.length === 1 && out.skills[0] === 'dragon_breath', '动态演示技能被污染');
  });
}

/* ============ 4. Boss ============ */
console.log('\n[Boss]');
{
  const h = createHarness();
  const g = h.game;

  check('5 阶 Boss 数据存在且 HP 递增', () => {
    const tiers = h.run('CONTENT.bosses.map(b => ({ tier: b.tier, hp: b.hp, name: b.name }))');
    assert(tiers.length === 5, 'Boss 数量不是 5: ' + tiers.length);
    for (let i = 1; i < tiers.length; i++) {
      assert(tiers[i].hp > tiers[i - 1].hp, 'Boss HP 没有递增');
      assert(tiers[i].tier === i + 1, 'Boss 阶数错误');
    }
  });

  check('每阶额外 1 个异族 Boss，贴图与机制齐全', () => {
    const info = h.run(`({
      alts: CONTENT.bossAlts.map(b => ({ tier: b.tier, key: b.key, name: b.name, tag: b.tag, mechanic: b.mechanic })),
      bossAssets: CONTENT.assets.boss
    })`);
    assert(info.alts.length === 5, '异族 Boss 数量不是 5: ' + info.alts.length);
    const seen = new Set();
    for (let tier = 1; tier <= 5; tier++) {
      const alt = info.alts.find(a => a.tier === tier);
      assert(alt, '缺少第 ' + tier + ' 阶异族 Boss');
      assert(alt.key && info.bossAssets[alt.key], '异族 Boss 贴图路径缺失: ' + alt.key);
      assert(alt.mechanic, '异族 Boss 缺少机制: ' + alt.name);
      assert(alt.tag, '异族 Boss 缺少种族标签: ' + alt.name);
      assert(!seen.has(alt.key), '异族 Boss 贴图 key 重复: ' + alt.key);
      seen.add(alt.key);
    }
  });

  check('异族 Boss 机制都能实际触发', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      GAME.player.iframe = 999;
      GAME.player.xpMul = 0;          // 防止升级界面打断 12 秒机制观察
      GAME.forceBossAlt = true;
      GAME.enemies.length = 0;
      GAME.bosses.length = 0;
      GAME.zones.length = 0;
      GAME.projectiles.length = 0;
      GAME.spawner.opened = true;
      GAME.spawner.spawnT = 999;
      GAME.spawner.eliteT = 999;
      const counts = {};
      const orig = Enemy.prototype.beginMechanic;
      Enemy.prototype.beginMechanic = function (g, p) {
        counts[this.mechanic] = (counts[this.mechanic] || 0) + 1;
        return orig.call(this, g, p);
      };
      const rows = [];
      for (let tier = 1; tier <= 5; tier++) {
        GAME.enemies.length = 0;
        GAME.bosses.length = 0;
        GAME.zones.length = 0;
        GAME.projectiles.length = 0;
        const b = GAME.spawnBoss(tier);
        for (let i = 0; i < 60 * 12; i++) GAME.update(1 / 60);
        rows.push({ tier: tier, art: b.art, name: b.name, mechanic: b.mechanic, mechT: b.mechT });
      }
      Enemy.prototype.beginMechanic = orig;
      return { counts: counts, rows: rows };
    })()`);
    for (const m of ['charge', 'poison', 'totem', 'firerain', 'breath']) {
      assert(out.counts[m] > 0, '机制没有触发: ' + m + ' ' + JSON.stringify(out.counts));
    }
    for (const row of out.rows) {
      assert(row.art && row.art !== String(row.tier), '第 ' + row.tier + ' 阶没有使用异族贴图: ' + row.art);
      assert(row.mechanic, '第 ' + row.tier + ' 阶没有机制');
    }
  });

  check('亡灵毒云会持续伤害玩家', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      GAME.enemies.length = 0;
      GAME.spawner.opened = true;
      GAME.spawner.spawnT = 999;
      GAME.spawner.eliteT = 999;
      p.iframe = 0;
      p.invuln = 0;
      const before = p.hp;
      GAME.zones.push(new Zone({
        x: p.x, y: p.y, r: 110, kind: 'field', hostile: true,
        duration: 2.4, tick: 0.6, dps: 10, color: '#8ce99a'
      }));
      for (let i = 0; i < 180; i++) GAME.update(1 / 60);
      return { before: before, after: p.hp };
    })()`);
    assert(out.after < out.before, '毒云没有造成伤害: ' + JSON.stringify(out));
  });

  check('2 分钟刷第 1 阶，4 分钟刷第 2 阶且可同场', () => {
    h.run('GAME.start("warrior", "normal"); GAME.player.iframe = 999; GAME.spawner.t = 119.99;');
    for (let i = 0; i < 5; i++) g.update(1 / 60);
    assert(g.bosses.length === 1, '120 秒没有刷出第 1 阶: ' + g.bosses.length);
    assert(g.bosses[0].tier === 1, '第 1 阶阶数错误');

    h.run('GAME.spawner.t = 239.99;');
    for (let i = 0; i < 5; i++) g.update(1 / 60);
    assert(g.bosses.length === 2, '240 秒没有同时存在 2 只: ' + g.bosses.length);
    assert(g.bosses[1].tier === 2, '第 2 阶阶数错误');
    assert(g.bosses[1].maxHp > g.bosses[0].maxHp, '第 2 阶 HP 没有变高');
  });

  check('Boss 会发射弹幕', () => {
    const hostile = g.projectiles.filter(p => p.hostile).length;
    for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
    assert(g.projectiles.filter(p => p.hostile).length > hostile, 'Boss 没有发射弹幕');
  });

  check('击杀第 1 阶不通关，击杀第 5 阶通关', () => {
    h.run('GAME.start("warrior", "normal"); const b = GAME.spawnBoss(1); damageEnemy(GAME, b, 999999, {quiet:true, silent:true});');
    assert(g.state === 'playing', '击杀第 1 阶就通关了');

    h.run('const b5 = GAME.spawnBoss(5); damageEnemy(GAME, b5, 999999, {quiet:true, silent:true});');
    assert(g.state === 'win', '击杀第 5 阶没有通关: ' + g.state);
  });

  check('Boss 同场时 HUD 渲染不报错', () => {
    h.run('GAME.start("warrior", "normal"); GAME.forceBossAlt = true; GAME.spawnBoss(1); GAME.spawnBoss(2); GAME.spawnBoss(3); GAME.spawnBoss(4); GAME.spawnBoss(5);');
    g.render();
  });
}

/* ============ 4. 难度 ============ */
console.log('\n[难度]');
{
  const h = createHarness();
  const g = h.game;

  check('硬核敌人 HP/伤害倍率生效', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal');
      GAME.enemies.length = 0;
      const a = GAME.spawnEnemy('brute', 500, 500, false);
      const normalHp = a.maxHp, normalDmg = a.dmg;
      GAME.start('warrior', 'hardcore');
      GAME.enemies.length = 0;
      const b = GAME.spawnEnemy('brute', 500, 500, false);
      return {
        normalHp: normalHp, normalDmg: normalDmg, hardHp: b.maxHp, hardDmg: b.dmg,
        hpMul: CONTENT.difficulties.hardcore.enemyHp / CONTENT.difficulties.normal.enemyHp,
        dmgMul: CONTENT.difficulties.hardcore.enemyDmg / CONTENT.difficulties.normal.enemyDmg
      };
    })()`);
    assert(near(out.hardHp / out.normalHp, out.hpMul, 1e-6), '硬核敌人 HP 倍率错误: ' + out.hardHp / out.normalHp);
    assert(near(out.hardDmg / out.normalDmg, out.dmgMul, 1e-6), '硬核敌人伤害倍率错误: ' + out.hardDmg / out.normalDmg);
  });

  check('硬核 Boss HP 倍率生效', () => {
    const out = h.run(`(() => {
      GAME.start('warrior', 'normal'); GAME.enemies.length = 0;
      const a = GAME.spawnBoss(1); const normal = a.maxHp;
      GAME.start('warrior', 'hardcore'); GAME.enemies.length = 0;
      const b = GAME.spawnBoss(1); return {
        normal: normal, hard: b.maxHp,
        mul: CONTENT.difficulties.hardcore.bossHp / CONTENT.difficulties.normal.bossHp
      };
    })()`);
    assert(near(out.hard / out.normal, out.mul, 1e-6), '硬核 Boss HP 倍率错误: ' + out.hard / out.normal);
  });

  check('难度可以切换并跨局保留', () => {
    h.run('GAME.start("warrior", "normal"); GAME.toggleDifficulty();');
    assert(g.difficulty === 'hardcore', '没有切到硬核');
    h.run('GAME.start("mage");');
    assert(g.difficulty === 'hardcore', '新一局没有保留难度');
    assert(g.mods.id === 'hardcore', 'mods 没有切到硬核');
  });
}

/* ============ 5. 升级与卡池 ============ */
console.log('\n[升级]');
{
  const h = createHarness();
  const g = h.game;

  check('升级三选一里必有技能相关，且选卡后回到游戏', () => {
    h.run('GAME.start("warrior", "normal"); GAME.gainXp(200);');
    assert(g.state === 'levelup', '没有进入升级界面: ' + g.state);
    assert(g.offers.length === 3, '选项数不是 3: ' + g.offers.length);
    const hasSkill = g.offers.some(o => o.kind === 'skill' || o.kind === 'up');
    assert(hasSkill, '没有技能相关卡');
    while (g.state === 'levelup') { g.update(1 / 60); g.choose(0); }
    assert(g.state === 'playing', '没有回到游戏: ' + g.state);
  });

  check('5 个技能位满后不再出现新技能卡', () => {
    const offers = h.run(`(() => {
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.skills.length = 0;
      const ids = CONTENT.classes.warrior.skills;
      for (let i = 0; i < 5; i++) { p.addSkill(ids[i]); p.skill(ids[i]).lvl = 5; }
      return rollOffers(p, 3).map(o => o.kind);
    })()`);
    assert(!offers.includes('skill'), '5 格满了还出现新技能: ' + offers.join(','));
  });

  check('技能不会超过 5 级', () => {
    const lvl = h.run(`(() => {
      GAME.start('mage', 'normal');
      const p = GAME.player;
      for (let i = 0; i < 30; i++) p.addSkill('fireball');
      return p.skill('fireball').lvl;
    })()`);
    assert(lvl === 5, '技能等级超过 5: ' + lvl);
  });

  check('升级卡 / 结算 / 标题 / 职业选择都能渲染', () => {
    h.run('GAME.start("mage", "normal"); GAME.gainXp(50);');
    g.render();
    h.run('GAME.state = "classselect";');
    g.render();
    h.run('GAME.state = "title";');
    g.render();
    h.run('GAME.state = "dead";');
    g.render();
  });
}

/* ============ 6. 存档 / 拾取 / 死亡 ============ */
console.log('\n[存档与拾取]');
{
  const h = createHarness();
  const g = h.game;

  check('经验宝石会被吸附并转化为经验', () => {
    h.run(`
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.magnet = 300;
      GAME.spawner.opened = true; GAME.spawner.spawnT = 999; GAME.spawner.eliteT = 999;
      GAME.gems.push(new Gem(p.x + 120, p.y, 5));
    `);
    const xp0 = g.player.xp;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    assert(g.gems.length === 0, '宝石没被拾取');
    assert(g.player.xp > xp0 || g.player.level > 1, '经验没增加');
  });

  check('回血宝石恢复生命', () => {
    h.run(`
      (function () {
        GAME.pendingLevels = 0; GAME.state = 'playing';
        const p = GAME.player; p.hp = 40; p.magnet = 300;
        GAME.gems.length = 0;
        GAME.gems.push(new Gem(p.x + 40, p.y, 0, 20));
      })();
    `);
    const hp0 = g.player.hp;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    assert(g.player.hp > hp0, '没有回血: ' + hp0 + ' → ' + g.player.hp);
  });

  check('正常/硬核最佳记录分开保存', () => {
    h.run('GAME.start("warrior", "normal"); GAME.t = 100; GAME.kills = 42; GAME.player.iframe = 0; GAME.player.hurt(9999, GAME);');
    assert(g.state === 'dead', '没有死亡');
    assert(g.best.normal.time === 100, '正常记录时间错误: ' + g.best.normal.time);
    assert(g.best.normal.kills === 42, '正常记录击杀错误');

    h.run('GAME.start("mage", "hardcore"); GAME.t = 10; GAME.kills = 7; GAME.player.iframe = 0; GAME.player.hurt(9999, GAME);');
    assert(g.best.hardcore.time === 10, '硬核记录时间错误: ' + g.best.hardcore.time);
    assert(g.best.normal.time === 100, '硬核记录覆盖了正常记录');
  });

  check('通关后按 R 能以同职业重开', () => {
    h.run('GAME.start("mage", "hardcore"); GAME.spawnBoss(5); const b = GAME.bosses[GAME.bosses.length - 1]; damageEnemy(GAME, b, 999999, {quiet:true, silent:true});');
    assert(g.state === 'win', '没有进入胜利');
    h.run('Input.pressed = {KeyR:true};');
    g.update(1 / 60);
    assert(g.state === 'playing', '没有重开');
    assert(g.player.classId === 'mage', '重开后职业变了: ' + g.player.classId);
    assert(g.player.maxHp === 110, '重开后法师数值不对');
  });
}

/* ============ 7. 存档槽 / 职业 / 形象流程 ============ */
console.log('\n[存档槽与开局流程]');
{
  const h = createHarness();
  const g = h.game;

  check('标题按空格进入槽位页，选空槽后进入职业选择', () => {
    g.state = 'title';
    h.run("Input.pressed = {Space:true};");
    g.update(1 / 60);
    assert(g.state === 'slots', '没有进入槽位页: ' + g.state);

    h.run("Input.pressed = {Digit1:true};");
    g.update(1 / 60);
    assert(g.state === 'classselect', '没有进入职业选择: ' + g.state);
    assert(g.creatingSlot === 0, '没有记录创建槽位: ' + g.creatingSlot);
  });

  check('选法师 / 第二形象后创建槽位并进入天赋树', () => {
    h.run("Input.pressed = {Digit2:true};");
    g.update(1 / 60);
    assert(g.state === 'skinselect', '没有进入形象选择: ' + g.state);
    assert(g.selectedClass === 'mage', '没有选中法师');

    h.run("Input.pressed = {Digit2:true};");
    g.update(1 / 60);
    assert(g.state === 'talent', '创建后没有进入天赋树: ' + g.state);
    const slot = g.activeSlot();
    assert(slot && slot.classId === 'mage', '槽位职业不是法师');
    assert(slot.skin === 2, '槽位形象不是 2');
    assert(slot.gold === 0, '新槽金币不是 0');
    assert(slot.talents && Object.keys(slot.talents).length === 0, '新槽天赋不是空');
    assert(g.creatingSlot === null, '创建完成后 creatingSlot 没清空');
  });

  check('天赋页按 Enter 用槽位职业与形象开局', () => {
    h.run("Input.pressed = {Enter:true};");
    g.update(1 / 60);
    assert(g.state === 'playing', '没有开始游戏: ' + g.state);
    assert(g.player.classId === 'mage', '开局职业不对: ' + g.player.classId);
    assert(g.player.skin === 2, '开局形象不对: ' + g.player.skin);
    assert(g.runMode === 'slot', '不是槽位模式: ' + g.runMode);
  });

  check('形象选择页 Esc 返回职业选择，再 Esc 回槽位页', () => {
    g.state = 'skinselect';
    g.creatingSlot = 2;
    h.run("Input.pressed = {Escape:true};");
    g.update(1 / 60);
    assert(g.state === 'classselect', 'Esc 没有返回职业选择: ' + g.state);
    h.run("Input.pressed = {Escape:true};");
    g.update(1 / 60);
    assert(g.state === 'slots', '再次 Esc 没有回槽位页: ' + g.state);
    assert(g.creatingSlot === null, '返回槽位页时 creatingSlot 没清空');
  });

  check('建槽过程中切难度不影响已存在槽位', () => {
    g.state = 'classselect';
    g.creatingSlot = 2;
    g.difficulty = 'normal';
    const before = g.slotAt(0).difficulty;
    h.run("Input.pressed = {Tab:true};");
    g.update(1 / 60);
    assert(g.difficulty === 'hardcore', 'Tab 没有切到硬核');
    assert(g.slotAt(0).difficulty === before, '建槽时误改了已有槽难度');
    h.run("Input.pressed = {Tab:true};");
    g.update(1 / 60);
    assert(g.difficulty === 'normal', 'Tab 没有切回正常');
  });

  check('二次确认删除存档后，槽位立即清空且下一帧不崩溃', () => {
    const h2 = createHarness();
    const g2 = h2.game;
    g2.createSlot(0, 'warrior', 1);
    g2.state = 'slots';
    const rects = h2.run('UI.slotRects(GAME)');
    const del = rects[0].del;
    h2.run(`Input.mouse.x = ${del.x + del.w / 2}; Input.mouse.y = ${del.y + del.h / 2}; Input.mouse.clicked = true;`);
    g2.updateSlots(1 / 60);
    assert(g2.slotDelete.index === 0 && g2.slotDelete.t > 0, '第一次点击没有进入删除确认');
    h2.run('Input.mouse.clicked = true;');
    g2.updateSlots(1 / 60);
    assert(g2.slotAt(0) === null, '确认删除后槽位还在');
    const saved = JSON.parse(h2.context.localStorage.getItem('abyss.slots.v1'));
    assert(saved.slots[0] === null, '确认删除后存档没有立即写回');
    h2.run('Input.mouse.clicked = false;');
    g2.updateSlots(1 / 60); // 修复前这里会读 slotDelete.t 抛错
    g2.state = 'slots';
    g2.render();
    assert(g2.slotAt(0) === null, '删除后槽位又出现了');
  });
}

/* ============ 8. 天赋树 / 存档 / 金币 ============ */
console.log('\n[天赋树与三槽存档]');
{
  const h = createHarness();

  check('两职业各有 3 分支 × 10 节点，满级 84 级', () => {
    const info = h.run(`(() => {
      const out = {};
      for (const cid of ['warrior', 'mage']) {
        const tree = CONTENT.talentTrees[cid];
        const nodes = Talents.nodes(cid);
        out[cid] = {
          branches: tree.branches.length,
          nodes: nodes.length,
          perBranch: tree.branches.map(b => b.nodes.length),
          skillNodes: tree.branches.map(b => b.nodes.filter(n => n.type === 'skill').length),
          max: Talents.maxRanks(cid)
        };
      }
      return out;
    })()`);
    for (const cid of ['warrior', 'mage']) {
      assert(info[cid].branches === 3, cid + ' 分支数不是 3');
      assert(info[cid].nodes === 30, cid + ' 节点数不是 30: ' + info[cid].nodes);
      assert(info[cid].perBranch.every(n => n === 10), cid + ' 每分支不是 10 节点');
      assert(info[cid].skillNodes.every(n => n === 5), cid + ' 每分支技能节点不是 5');
      assert(info[cid].max === 84, cid + ' 满级不是 84: ' + info[cid].max);
    }
  });

  check('节点前置都存在，终极需要两个 5 环节点各 2 级', () => {
    const bad = h.run(`(() => {
      const out = [];
      for (const cid of ['warrior', 'mage']) {
        const nodes = Talents.nodes(cid);
        const ids = new Set(nodes.map(n => n.id));
        for (const n of nodes) {
          for (const r of n.req) if (!ids.has(r)) out.push(n.id + ' -> ' + r);
          if (n.id.endsWith('.keystone') && n.reqRank !== 2) out.push(n.id + ' reqRank');
        }
      }
      return out;
    })()`);
    assert(bad.length === 0, '前置错误: ' + bad.join(', '));
  });

  check('金币不足 / 前置不足 / 满级都会拒绝购买', () => {
    const h2 = createHarness();
    const g2 = h2.game;
    g2.openSlot(0);
    g2.selectedClass = 'warrior';
    g2.finishCreateSlot(1);
    const s = g2.activeSlot();
    const T = h2.run('Talents');

    s.gold = 0;
    let r = T.buy(s, 'arms.core');
    assert(!r.ok && r.reason === 'gold', '金币不足没有拒绝');

    s.gold = 1000;
    r = T.buy(s, 'arms.skill1');
    assert(!r.ok && r.reason === 'req', '前置不足没有拒绝');

    T.buy(s, 'arms.core');
    T.buy(s, 'arms.skill1');
    T.buy(s, 'arms.skill1');
    r = T.buy(s, 'arms.skill1');
    assert(r.ok && r.rank === 3, '第三次升级失败');
    r = T.buy(s, 'arms.skill1');
    assert(!r.ok && r.reason === 'max', '满级没有拒绝');
  });

  check('洗点清空等级并返还 80%', () => {
    const h2 = createHarness();
    const g2 = h2.game;
    g2.openSlot(0);
    g2.selectedClass = 'warrior';
    g2.finishCreateSlot(1);
    const s = g2.activeSlot();
    const T = h2.run('Talents');
    s.gold = 1000;
    T.buy(s, 'arms.core');
    T.buy(s, 'arms.core');
    const spent = T.spent('warrior', s.talents);
    const before = s.gold;
    const res = T.respec(s);
    assert(res.refund === Math.floor(spent * 0.8), '返还不正确: ' + res.refund);
    assert(s.gold === before + res.refund, '金币没有返还');
    assert(Object.keys(s.talents).length === 0, '天赋没有清空');
    assert(T.totalRanks(s) === 0, '总等级没有清零');
  });

  check('天赋永久加成进入玩家面板，技能修正进入 skillStats', () => {
    const h2 = createHarness();
    const g2 = h2.game;
    g2.openSlot(0);
    g2.selectedClass = 'warrior';
    g2.finishCreateSlot(1);
    const s = g2.activeSlot();
    const T = h2.run('Talents');
    s.gold = 5000;
    for (let i = 0; i < 3; i++) T.buy(s, 'arms.core');
    for (let i = 0; i < 3; i++) T.buy(s, 'arms.vitality');
    for (let i = 0; i < 3; i++) T.buy(s, 'arms.skill1');

    g2.startSlotRun();
    assert(near(g2.player.maxHp, 170 * 1.15, 0.01), '生命加成没生效: ' + g2.player.maxHp);
    const mod = g2.player.skillMods.heroic_strike;
    assert(mod && near(mod.dmg, 0.36), '技能伤害加成不对: ' + (mod && mod.dmg));
    assert(mod && near(mod.cd, -0.09), '技能冷却加成不对: ' + (mod && mod.cd));

    const st = h2.run('skillStats(GAME.player, CONTENT.skills.heroic_strike, GAME.player.skills[0])');
    assert(near(st.dmg, 32 * 1.36, 0.01), 'skillStats 伤害没生效: ' + st.dmg);
    assert(near(st.cd, 1.2 * 0.91, 0.01), 'skillStats 冷却没生效: ' + st.cd);
  });

  check('未点天赋时 skillStats 直接返回基础对象，不产生空修正', () => {
    const h2 = createHarness();
    const g2 = h2.game;
    g2.openSlot(0);
    g2.selectedClass = 'warrior';
    g2.finishCreateSlot(1);
    g2.startSlotRun();
    const st = h2.run('skillStats(GAME.player, CONTENT.skills.heroic_strike, GAME.player.skills[0])');
    const base = h2.run('CONTENT.skills.heroic_strike.lvl[0]');
    assert(st === base, '空天赋不应克隆基础对象');
    const bon = h2.run('Talents.bonuses("warrior", GAME.activeSlot().talents)');
    assert(Object.keys(bon.skills).length === 0, '空天赋不应生成技能修正表');
  });

  check('三槽独立保存，重新加载后金币 / 天赋 / 职业不串', () => {
    const h2 = createHarness();
    const g2 = h2.game;
    g2.openSlot(0);
    g2.selectedClass = 'warrior';
    g2.finishCreateSlot(1);
    g2.activeSlot().gold = 777;
    g2.saveSlots();

    g2.openSlot(1);
    g2.selectedClass = 'mage';
    g2.finishCreateSlot(2);
    g2.activeSlot().gold = 333;
    g2.saveSlots();

    const raw = h2.run('localStorage.getItem("abyss.slots.v1")');
    const h3 = createHarness({ 'abyss.slots.v1': raw });
    const g3 = h3.game;
    assert(g3.slots.length === 3, '槽位数量不对');
    assert(g3.slotAt(0).classId === 'warrior' && g3.slotAt(0).gold === 777, '槽 0 数据丢失');
    assert(g3.slotAt(1).classId === 'mage' && g3.slotAt(1).gold === 333, '槽 1 数据丢失');
    assert(g3.slotAt(2) === null, '槽 2 不该被创建');
  });

  check('旧 abyss.best.v3 会迁移到槽 0，旧 key 保留', () => {
    const old = JSON.stringify({
      normal: { time: 123, kills: 45, level: 9, classId: 'mage' },
      hardcore: { time: 66, kills: 20, level: 6, classId: 'mage' }
    });
    const h2 = createHarness({ 'abyss.best.v3': old, 'abyss.diff.v1': 'hardcore' });
    const g2 = h2.game;
    const s = g2.activeSlot();
    assert(s && s.classId === 'mage', '迁移职业不对');
    assert(s.stats.normal.time === 123 && s.stats.hardcore.time === 66, '迁移记录不对');
    assert(s.difficulty === 'hardcore', '迁移难度不对');
    assert(h2.run('localStorage.getItem("abyss.best.v3")') === old, '旧 key 被删除 / 改写');
  });

  check('坏存档不崩溃，按空槽降级', () => {
    const h2 = createHarness({ 'abyss.slots.v1': '{not-json' });
    const g2 = h2.game;
    assert(g2.slots.length === 3 && g2.slots.every(s => s === null), '坏存档没有降级为空槽');
    g2.render();
  });

  check('直接模式不读写任何槽位', () => {
    const h2 = createHarness();
    const g2 = h2.game;
    g2.start('warrior', 'normal');
    g2.runGold = 50;
    g2.player.iframe = 0;
    g2.player.hurt(9999, g2);
    assert(g2.slots.every(s => s === null), '直接模式创建了槽位');
    assert(g2.runMode === 'direct', '直接模式标记不对');
  });

  check('每个天赋节点都有图标资源，技能节点复用技能图标', () => {
    const missing = h.run(`(() => {
      const out = [];
      for (const cid in CONTENT.talentTrees) {
        for (const n of Talents.nodes(cid)) {
          const a = Talents.iconAsset(n);
          if (!a) { out.push(n.id + ':none'); continue; }
          const path = a.cat === 'talent' ? CONTENT.assets.talent[a.key] : CONTENT.assets.skill[a.key];
          if (!path) out.push(n.id + ':' + a.cat + '/' + a.key);
        }
      }
      return out;
    })()`);
    assert(missing.length === 0, '天赋图标映射缺失: ' + missing.join(', '));
  });
}

/* ============ 9. 金币 / 侵蚀 ============ */
console.log('\n[金币与深渊侵蚀]');
{
  check('金币拾取增加本局金币，结算写入槽位且只结算一次', () => {
    const h = createHarness();
    const g = h.game;
    g.openSlot(0);
    g.selectedClass = 'warrior';
    g.finishCreateSlot(1);
    g.startSlotRun();
    const p = g.player;
    g.gems.length = 0;
    g.runGold = 0;
    g.dropGold(p.x, p.y, 17);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    assert(g.runGold === 17, '金币拾取不对: ' + g.runGold);

    g.dropGold(p.x + 400, p.y + 400, 10);   // 没捡到
    g.settleRun(false);
    assert(g.activeSlot().gold === 27, '结算没有收编剩余金币: ' + g.activeSlot().gold);
    assert(g.activeSlot().totals.runs === 1, '局数没有 +1');
    g.settleRun(false);
    assert(g.activeSlot().gold === 27, '重复结算加了金币');
  });

  check('Boss 金币按阶掉落，爆金币总数正确', () => {
    const h = createHarness();
    const g = h.game;
    g.openSlot(0);
    g.selectedClass = 'warrior';
    g.finishCreateSlot(1);
    g.startSlotRun();
    const expected = [30, 50, 80, 120, 200];
    for (let tier = 1; tier <= 5; tier++) {
      assert(g.bossGold(tier) === expected[tier - 1], 'Boss ' + tier + ' 金币不对');
      g.gems.length = 0;
      g.dropGoldBurst(100, 100, g.bossGold(tier));
      let sum = 0;
      for (const gem of g.gems) if (gem.gold) sum += gem.value;
      assert(sum === expected[tier - 1], 'Boss ' + tier + ' 爆金币总数不对: ' + sum);
    }
  });

  check('深渊侵蚀按总等级计算，满级 +20% 生命 / +8% 伤害', () => {
    const h = createHarness();
    const ero = h.run('Talents.erosion(84)');
    assert(ero.stacks === 8, '满级层数不对: ' + ero.stacks);
    assert(near(ero.hp, 1.2) && near(ero.dmg, 1.08), '满级侵蚀倍率不对');
    const ero0 = h.run('Talents.erosion(9)');
    assert(ero0.stacks === 0 && ero0.hp === 1 && ero0.dmg === 1, '低等级侵蚀不应生效');
  });

  check('侵蚀实际乘到敌人生命 / 伤害上', () => {
    const h = createHarness();
    const g = h.game;
    g.start('warrior', 'normal');
    g.erosion = { stacks: 8, hp: 1.2, dmg: 1.08 };
    const key = Object.keys(h.run('CONTENT.enemies'))[0];
    const base = h.run('CONTENT.enemies["' + key + '"]');
    const e = g.spawnEnemy(key, 100, 100);
    assert(near(e.maxHp, base.hp * g.mods.enemyHp * 1.2, 0.01), '敌人生命没有乘侵蚀');
    assert(near(e.dmg, base.dmg * g.mods.enemyDmg * 1.08, 0.01), '敌人伤害没有乘侵蚀');
  });

  check('槽位页 / 天赋页 / 金币 HUD 渲染不报错', () => {
    const h = createHarness();
    const g = h.game;
    g.openSlot(0);
    g.selectedClass = 'warrior';
    g.finishCreateSlot(1);
    g.activeSlot().gold = 500;
    g.state = 'slots';
    g.render();
    g.state = 'talent';
    g.render();
    g.startSlotRun();
    g.dropGold(g.player.x, g.player.y, 5);
    g.render();
    assert(true, '渲染抛错');
  });
}

console.log('\n[素材与性能]');
{
  const h = createHarness();
  const g = h.game;

  check('没有 Image 时素材接口回退，渲染不报错', () => {
    const used = h.run(`(() => {
      GAME.start('warrior', 'normal');
      return {
        icon: Assets.icon(GAME.ctx, 'heroic_strike', 0, 0, 20),
        player: Assets.draw(GAME.ctx, 'player', 'warrior_1', 0, 0, 20, 20),
        enemy: Assets.draw(GAME.ctx, 'enemy', 'slime', 0, 0, 20, 20),
        cover: Assets.drawCover(GAME.ctx, 'background', 1, 0, 0, 20, 20)
      };
    })()`);
    assert(used.icon === false && used.player === false && used.enemy === false, '无图时没有回退');
    assert(used.cover === false, '无背景图时没有回退');
    g.render();
  });

  check('每个职业有 2 个形象，素材路径齐全', () => {
    const info = h.run(`({
      warrior: CONTENT.classes.warrior.skins,
      mage: CONTENT.classes.mage.skins,
      player: Object.keys(CONTENT.assets.player),
      sceneCount: CONTENT.sceneCount,
      background: Object.keys(CONTENT.assets.background)
    })`);
    for (const id of ['warrior', 'mage']) {
      assert(info[id] && info[id].length === 2, id + ' 形象数量不是 2');
      for (const key of info[id]) {
        assert(info.player.indexOf(key) >= 0, id + ' 缺少形象素材路径: ' + key);
      }
    }
    assert(info.sceneCount === 3, '背景场景数量不是 3');
    for (let i = 1; i <= 3; i++) {
      assert(info.background.indexOf(String(i)) >= 0, '缺少背景场景路径: ' + i);
    }
  });

  check('素材初始化按新 key 加载 2 形象与 3 背景', () => {
    const h2 = createHarness();
    const info = h2.run(`(() => {
      Image = class {
        constructor() {
          this.width = 100; this.height = 100;
          this.onload = null; this.onerror = null;
        }
        set src(v) { this._src = v; if (this.onload) this.onload(); }
        get src() { return this._src; }
      };
      // 夹具加载时已 boot 过一次 (当时没有 Image), 手动重置后重跑加载
      Assets.inited = false;
      Assets.map = Object.create(null);
      Assets.init();
      const bg = Assets.entry('background', 1);
      const p2 = Assets.entry('player', 'warrior_2');
      return {
        bg: bg && bg.src, bgReady: bg && bg.ready,
        p2: p2 && p2.src, p2Ready: p2 && p2.ready
      };
    })()`);
    assert(info.bg === 'assets/background/scene_1.png', '背景 1 路径错误: ' + info.bg);
    assert(info.p2 === 'assets/player/warrior_2.png', '战士形象 2 路径错误: ' + info.p2);
    assert(info.bgReady === true && info.p2Ready === true, '假 Image 没有进入 ready 状态');
  });

  check('背景场景在 1~3 内，sceneLock 可固定调试', () => {
    g.sceneLock = 2;
    g.reset();
    assert(g.scene === 2, 'sceneLock 没固定场景: ' + g.scene);
    g.sceneLock = null;
    for (let i = 0; i < 120; i++) {
      g.reset();
      assert(g.scene >= 1 && g.scene <= 3, '随机场景越界: ' + g.scene);
    }
  });

  check('形象选择页 / 带背景的世界都能渲染', () => {
    g.state = 'skinselect';
    g.selectedClass = 'warrior';
    g.render();
    g.view = { w: 800, h: 600, dpr: 1 };
    g.render();
    g.view = { w: 1280, h: 720, dpr: 1 };
    g.start('warrior', 'normal', 2);
    assert(g.player.skinKey === 'warrior_2', '战士第二形象 key 错误');
    g.scene = 3;
    g.render();
  });

  check('受伤闪白时仍绘制 PNG，不回退矢量', () => {
    const h3 = createHarness();
    const calls = h3.run(`(() => {
      Image = class {
        constructor() {
          this.width = 100; this.height = 100;
          this.onload = null; this.onerror = null;
        }
        set src(v) { this._src = v; if (this.onload) this.onload(); }
        get src() { return this._src; }
      };
      Assets.inited = false;
      Assets.map = Object.create(null);
      Assets.init();
      GAME.start('warrior', 'normal');
      GAME.player.flash = 0.2;
      let n = 0;
      const orig = Assets.draw;
      Assets.draw = function (ctx, cat, key) {
        if (cat === 'player') n++;
        return orig.apply(this, arguments);
      };
      GAME.render();
      Assets.draw = orig;
      return n;
    })()`);
    assert(calls >= 2, '受伤闪白时 PNG 绘制次数不足: ' + calls);
  });

  check('异族 Boss 贴图 key 能加载并渲染', () => {
    const h4 = createHarness();
    const info = h4.run(`(() => {
      Image = class {
        constructor() {
          this.width = 100; this.height = 100;
          this.onload = null; this.onerror = null;
        }
        set src(v) { this._src = v; if (this.onload) this.onload(); }
        get src() { return this._src; }
      };
      Assets.inited = false;
      Assets.map = Object.create(null);
      Assets.init();
      GAME.start('warrior', 'normal');
      GAME.forceBossAlt = true;
      for (let tier = 1; tier <= 5; tier++) GAME.spawnBoss(tier);
      GAME.render();
      return {
        ready: CONTENT.bossAlts.map(a => !!(Assets.entry('boss', a.key) && Assets.entry('boss', a.key).ready)),
        names: GAME.bosses.map(b => b.name),
        tags: GAME.bosses.map(b => b.tag)
      };
    })()`);
    assert(info.ready.every(Boolean), '异族 Boss 贴图未全部进入 ready: ' + JSON.stringify(info.ready));
    assert(info.names.length === 5, '异族 Boss 没有全部生成: ' + info.names.length);
    assert(info.tags.every(Boolean), '异族 Boss 种族标签缺失: ' + JSON.stringify(info.tags));
  });

  check('400 只敌人下逻辑更新耗时合理', () => {
    h.run(`
      GAME.start('warrior', 'normal');
      const p = GAME.player;
      p.iframe = 999;
      GAME.enemies.length = 0;
      for (let i = 0; i < 400; i++) {
        const a = i / 400 * TAU;
        const e = GAME.spawnEnemy('skeleton', p.x + Math.cos(a) * (200 + (i % 7) * 40),
                                      p.y + Math.sin(a) * (200 + (i % 7) * 40), false);
        e.hp = e.maxHp = 99999;
      }
    `);
    const frames = 600;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < frames; i++) {
      g.update(1 / 60);
      if (g.state === 'levelup') g.choose(0);
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const perFrame = ms / frames;
    console.log('    → 平均 ' + perFrame.toFixed(3) + ' ms/帧 (400 敌人, 无渲染)');
    assert(perFrame < 8, '单帧逻辑耗时过高: ' + perFrame.toFixed(2) + 'ms');
  });
}

/* ============ 结果 ============ */
console.log('\n====================');
console.log('通过 ' + passed + ' 项');
if (fails.length) {
  console.error('失败 ' + fails.length + ' 项:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('✓ 全部通过');
