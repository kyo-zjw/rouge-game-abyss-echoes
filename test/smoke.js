/* 冒烟测试 v0.2: 战士/法师各跑一局, 抓运行时报错和数值异常
   运行: node test/smoke.js [秒数]  */

'use strict';

const { createHarness } = require('./harness');

const seconds = Number(process.argv[2] || 700);
const rows = [];

for (const cls of ['warrior', 'mage']) {
  const h = createHarness();
  const sim = h.run(`
  (function (CLS, SECONDS) {
    const out = {
      cls: CLS, frames: 0, maxEnemies: 0, levels: 0, state: 'title',
      error: null, tiers: [], maxBosses: 0, maxSkills: 0, renders: 0
    };
    try {
      GAME.autoplay = true;
      GAME.start(CLS, 'normal');
      GAME.render();
      out.renders++;

      for (let i = 0; i < 60 * SECONDS; i++) {
        GAME.update(1 / 60);
        out.frames++;

        if (i % 120 === 0) { GAME.render(); out.renders++; }

        if (GAME.bosses.length) {
          for (let j = 0; j < GAME.bosses.length; j++) {
            const b = GAME.bosses[j];
            if (out.tiers.indexOf(b.tier) < 0) out.tiers.push(b.tier);
          }
          out.maxBosses = Math.max(out.maxBosses, GAME.bosses.length);
        }
        out.maxSkills = Math.max(out.maxSkills, GAME.player.skills.length);
        out.maxEnemies = Math.max(out.maxEnemies, GAME.enemies.length);

        if (GAME.state === 'dead' || GAME.state === 'win') break;
      }

      out.state = GAME.state;
      out.time = Math.round(GAME.t * 10) / 10;
      out.kills = GAME.kills;
      out.level = GAME.player.level;
      out.hp = Math.round(GAME.player.hp);
      out.skin = GAME.player.skin;
      out.skinKey = GAME.player.skinKey;
      out.scene = GAME.scene;
      out.skills = GAME.player.skills.map(w => w.id + ':' + w.lvl).join(', ');
      out.passives = Object.keys(GAME.player.passives).map(k => k + ':' + GAME.player.passives[k]).join(', ');
      out.gemsOnFloor = GAME.gems.length;
      out.damage = Math.round(GAME.player.damageDealt);
      out.bossesLeft = GAME.bosses.map(b => b.tier + ':' + Math.round(b.hp));
      out.best = GAME.best[GAME.difficulty];

      const p = GAME.player;
      out.nanCheck = [p.x, p.y, p.hp, GAME.t, GAME.cam.x, p.damageDealt].every(v => isFinite(v));
    } catch (err) {
      out.error = (err && err.stack) || String(err);
    }
    return out;
  })(${JSON.stringify(cls)}, ${seconds})
  `);
  rows.push(sim);
}

console.log('--- 对局结果 ---');
console.log(JSON.stringify(rows, null, 2));

/* 重启流程 */
const restartHarness = createHarness();
const restart = restartHarness.run(`
(function () {
  try {
    GAME.autoplay = false;
    GAME.start('mage', 'normal');
    GAME.state = 'dead';
    Input.keys = {};
    Input.pressed = { KeyR: true };
    GAME.update(1 / 60);
    return {
      ok: GAME.state === 'playing' && GAME.t < 0.2 && GAME.player.classId === 'mage',
      state: GAME.state, cls: GAME.player.classId
    };
  } catch (err) {
    return { ok: false, error: (err && err.stack) || String(err) };
  }
})()
`);
console.log('--- 重启流程 ---');
console.log(JSON.stringify(restart, null, 2));

/* 断言 */
const fails = [];
for (const sim of rows) {
  if (sim.error) fails.push(sim.cls + ' 运行时异常: ' + sim.error);
  if (!sim.nanCheck) fails.push(sim.cls + ' 出现 NaN 数值');
  if (!(sim.kills > 0)) fails.push(sim.cls + ' 没有击杀任何敌人');
  if (!(sim.level > 1)) fails.push(sim.cls + ' 没有升级');
  if (!(sim.maxSkills > 0 && sim.maxSkills <= 5)) fails.push(sim.cls + ' 技能数量异常: ' + sim.maxSkills);
  if (!(sim.maxEnemies > 10)) fails.push(sim.cls + ' 刷怪异常: 同屏最多 ' + sim.maxEnemies);
  if (!(sim.scene >= 1 && sim.scene <= 3)) fails.push(sim.cls + ' 背景场景越界: ' + sim.scene);
  if (sim.skin !== 1 || sim.skinKey !== sim.cls + '_1') fails.push(sim.cls + ' 默认形象错误: ' + sim.skinKey);
  if (sim.time >= 120 && sim.tiers.indexOf(1) < 0) fails.push(sim.cls + ' 2 分钟没有刷出第 1 阶 Boss');
  if (sim.state === 'win' && sim.tiers.indexOf(5) < 0) fails.push(sim.cls + ' 通关了但没见过第 5 阶 Boss');
  if (sim.state === 'playing' && sim.time < seconds - 2) fails.push(sim.cls + ' 模拟提前卡住');
}
if (!restart.ok) fails.push('重启失败: ' + JSON.stringify(restart));

if (fails.length) {
  console.error('\n✗ 失败:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n✓ 冒烟测试通过');
