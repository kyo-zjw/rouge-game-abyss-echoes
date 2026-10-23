/* 平衡扫描 v0.3: 多职业 / 多难度 / 多种子 / 多天赋档位
   运行: node test/balance.js [局数] [both|warrior|mage] [normal|hardcore|both]
   例:   node test/balance.js 8 both normal
   天赋档位: TALENTS=full | TALENTS=50 (按比例铺满, 0 = 空树)
   关侵蚀:   EROSION=0 TALENTS=full node test/balance.js 4 both normal  */

'use strict';

const { createHarness } = require('./harness');

const runs = Number(process.argv[2] || 8);
const classArg = process.argv[3] || 'both';
const diffArg = process.argv[4] || 'normal';
const talEnv = process.env.TALENTS === undefined ? '' : String(process.env.TALENTS).trim();
const talents = talEnv === 'full' ? 'full' : (talEnv === '' ? null : Number(talEnv));
const erosion = process.env.EROSION !== '0';

const classes = classArg === 'both' ? ['warrior', 'mage'] : [classArg];
const diffs = diffArg === 'both' ? ['normal', 'hardcore'] : [diffArg];

const rows = [];

for (const cls of classes) {
  for (const diff of diffs) {
    for (let s = 1; s <= runs; s++) {
      const h = createHarness();
      const out = h.run(`
      (function (SEED, CLS, DIFF, FULL, ERO) {
        const r = {
          seed: SEED, cls: CLS, diff: DIFF, time: 0, kills: 0, level: 0,
          result: 'timeout', tiers: [], maxEnemies: 0, skills: ''
        };
        try {
          seedRandom(SEED);
          GAME.autoplay = true;
          GAME.debugTalents = FULL;
          GAME.erosionOff = !ERO;
          GAME.start(CLS, DIFF);

          for (let i = 0; i < 60 * 700; i++) {
            GAME.update(1 / 60);
            if (GAME.bosses.length) {
              for (let j = 0; j < GAME.bosses.length; j++) {
                const t = GAME.bosses[j].tier;
                if (r.tiers.indexOf(t) < 0) r.tiers.push(t);
              }
            }
            r.maxEnemies = Math.max(r.maxEnemies, GAME.enemies.length);
            if (GAME.state === 'dead') { r.result = 'dead'; break; }
            if (GAME.state === 'win') { r.result = 'win'; break; }
          }

          r.time = Math.round(GAME.t);
          r.kills = GAME.kills;
          r.level = GAME.player.level;
          r.hp = Math.round(GAME.player.hp);
          r.skills = GAME.player.skills.map(w => w.id + ':' + w.lvl).join(' ');
          r.passives = Object.keys(GAME.player.passives).map(k => k + ':' + GAME.player.passives[k]).join(' ');
          r.bossesLeft = GAME.bosses.map(b => b.tier + ':' + Math.round(b.hp));
        } catch (err) {
          r.result = 'error';
          r.error = (err && err.stack) || String(err);
        }
        return r;
      })(${s}, ${JSON.stringify(cls)}, ${JSON.stringify(diff)}, ${JSON.stringify(talents)}, ${erosion})
      `);
      rows.push(out);
    }
  }
}

console.log('职业    | 难度 | 种子 | 结果    | 用时 | 击杀 | 等级 | 技能');
console.log('--------+------+------+---------+------+------+------+--------------------------------');
for (const r of rows) {
  if (r.result === 'error') {
    console.log(r.cls.padEnd(7) + ' | ' + r.diff.padEnd(4) + ' | ' +
      String(r.seed).padStart(4) + ' | ERROR   | ' + r.error);
    continue;
  }
  console.log(
    r.cls.padEnd(7) + ' | ' +
    r.diff.padEnd(4) + ' | ' +
    String(r.seed).padStart(4) + ' | ' +
    r.result.padEnd(7) + ' | ' +
    String(r.time).padStart(4) + 's | ' +
    String(r.kills).padStart(4) + ' | ' +
    String(r.level).padStart(4) + ' | ' + (r.skills || '')
  );
}

console.log('\n--- 汇总 ---');
for (const cls of classes) {
  for (const diff of diffs) {
    const group = rows.filter(r => r.cls === cls && r.diff === diff);
    const wins = group.filter(r => r.result === 'win').length;
    const errors = group.filter(r => r.result === 'error');
    const avgTime = group.reduce((a, r) => a + (r.time || 0), 0) / group.length;
    const avgKills = group.reduce((a, r) => a + (r.kills || 0), 0) / group.length;
    const avgLevel = group.reduce((a, r) => a + (r.level || 0), 0) / group.length;
    const bossSeen = group.filter(r => r.tiers && r.tiers.length >= 5).length;
    console.log(
      cls.padEnd(7) + ' | ' + diff.padEnd(4) +
      ' | 通关 ' + wins + '/' + group.length +
      ' (' + Math.round(wins / group.length * 100) + '%)' +
      ' | 见 5 阶 ' + bossSeen + '/' + group.length +
      ' | 平均 ' + avgTime.toFixed(0) + 's / ' + avgKills.toFixed(0) + ' 击杀 / Lv ' + avgLevel.toFixed(0)
    );
    if (errors.length) {
      console.error('  ✗ 运行出错:');
      for (const e of errors) console.error('    seed ' + e.seed + ': ' + e.error);
    }
  }
}

const errors = rows.filter(r => r.result === 'error');
if (errors.length) process.exit(1);
