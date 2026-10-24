/* =========================================================
   深渊回响 — 内容表 v0.2
   10 分钟 / 5 阶 Boss / 战士 & 法师 / 正常 & 硬核
   想改数值 / 加技能 / 加怪物, 基本只动这个文件。
   ========================================================= */

'use strict';

/* 升级文案从 5 级数值自动生成, 避免手写 120 条文案对不上数值。
   想写更有味道的文案, 直接给技能加 up: ['...','...','...','...'] 覆盖即可。 */
function autoUp(def) {
  const delta = (a, b, unit) => (b >= a ? '+' : '-') + Math.abs(b - a).toFixed(2).replace(/\.?0+$/, '') + unit;
  return def.lvl.slice(1).map((n, i) => {
    const p = def.lvl[i];
    const parts = [];
    const add = (label, a, b, f) => {
      if (a !== undefined && b !== undefined && a !== b) parts.push(label + ' ' + f(a, b));
    };
    add('伤害', p.dmg, n.dmg, (a, b) => delta(a, b, ''));
    add('冷却', p.cd, n.cd, (a, b) => delta(a, b, 's'));
    add('范围', p.range, n.range, (a, b) => delta(a, b, ''));
    add('半径', p.radius, n.radius, (a, b) => delta(a, b, ''));
    add('弹数', p.count, n.count, (a, b) => '+' + (b - a));
    add('轮次', p.volleys, n.volleys, (a, b) => '+' + (b - a));
    add('连锁', p.chains, n.chains, (a, b) => '+' + (b - a));
    add('宽度', p.width, n.width, (a, b) => delta(a, b, ''));
    add('长度', p.length, n.length, (a, b) => delta(a, b, ''));
    add('击退', p.knock, n.knock, (a, b) => '+' + Math.round(b - a));
    add('护盾', p.shield, n.shield, (a, b) => '+' + (b - a));
    add('减速', p.slow, n.slow, (a, b) => Math.round(b * 100) + '%');
    add('持续时间', p.duration, n.duration, (a, b) => b.toFixed(1) + 's');
    add('伤害加成', p.dmgMul, n.dmgMul, (a, b) => '+' + Math.round((b - a) * 100) + '%');
    add('护甲', p.armor, n.armor, (a, b) => '+' + Math.round((b - a) * 100) + '%');
    add('无敌', p.invuln, n.invuln, (a, b) => '+' + (b - a).toFixed(2) + 's');
    add('回血', p.healPct, n.healPct, (a, b) => Math.round(b * 100) + '%');
    if (p.dot && n.dot) add('持续伤害', p.dot.dps, n.dot.dps, (a, b) => b + '/s');
    return parts.join('，') || '效果增强';
  });
}

const CONTENT = {
  title: '深渊回响',
  subtitle: 'ECHOES OF THE ABYSS',
  version: '0.9.0',

  world: { w: 2800, h: 2000 },   // 竞技场尺寸(世界坐标)
  runLength: 600,                // 秒: 一局目标时长
  bossTimes: [120, 240, 360, 480, 600],  // 秒: 5 阶 Boss 出场时间
  maxSkills: 5,                  // 单局最多装备技能数
  maxEnemies: 320,
  xpBase: 6,                     // 1 级升级所需经验
  eliteEvery: 45,                // 秒: 精英刷新间隔
  sceneCount: 3,                 // 背景场景数量: scene_1 ~ scene_3

  /* ---------------- 难度 ---------------- */
  /* 威胁等级: 把「怪越来越硬」做成玩家看得懂的 9 级刻度(HUD 与播报共用) */
  threat: {
    names: ['低语', '涌动', '侵蚀', '沸腾', '狂潮', '深渊', '崩坏', '终末', '回响'],
    colors: ['#63e6ff', '#74c0fc', '#a29bfe', '#b197fc', '#ffd166',
      '#ffa94d', '#ff8c42', '#ff6b8b', '#ff2d55']
  },

  difficulties: {
    normal: {
      id: 'normal', name: '正常', color: '#63e6ff',
      enemyHp: 1.00, enemyDmg: 0.90, spawnMul: 0.90,
      bossHp: 1.00, bossDmg: 0.90,
      healChance: 0.05, xpMul: 1.00,
      maxEnemies: 320, eliteEvery: 45
    },
    // 硬核 = 密度压力(满屏割草) + 明显更高的数值, 但经验不额外放水:
    // spawnMul 是「刷新间隔倍数」, 0.60 表示怪比正常多 ~50%; 上限更高、精英更频繁;
    // 实测给 xpMul 1.15 会让玩家多升 20 级, 反而把硬核变成白送, 所以压到 0.90。
    hardcore: {
      id: 'hardcore', name: '硬核', color: '#ff6b8b',
      enemyHp: 1.40, enemyDmg: 1.20, spawnMul: 0.60,
      bossHp: 1.50, bossDmg: 1.30, enrageMul: 0.85,
      healChance: 0.02, xpMul: 0.55, lateMul: 0.06,
      maxEnemies: 420, eliteEvery: 26, batchBonus: 2
    }
  },

  /* ---------------- 职业 ---------------- */
  classes: {
    warrior: {
      id: 'warrior', name: '战士', icon: '🛡', color: '#ffd166',
      role: '近战 / 坦克',
      desc: '高生命与护甲，贴身作战，靠怒吼和盾墙硬吃伤害。',
      hp: 170, speed: 168, armor: 0.12,
      dmgMul: 1.00, cdMul: 1.00, magnet: 130,
      startSkill: 'heroic_strike',
      displacement: 'charge',
      // 每个职业 2 个可选形象; key 与 CONTENT.assets.player 对应
      skins: ['warrior_1', 'warrior_2'],
      skills: [
        'heroic_strike', 'cleave', 'whirlwind', 'shield_slam', 'thunder_clap',
        'charge', 'rend', 'execute', 'victory_rush', 'battle_shout',
        'shield_wall', 'revenge', 'sunder_armor', 'overpower', 'bladestorm'
      ]
    },
    mage: {
      id: 'mage', name: '法师', icon: '🔥', color: '#74c0fc',
      role: '远程 / AOE',
      desc: '远程爆发与控制，身板脆，靠屏障和闪现保命。',
      hp: 122, speed: 190, armor: 0.00,
      dmgMul: 1.10, cdMul: 0.95, magnet: 130,
      startSkill: 'fireball',
      displacement: 'blink',
      skins: ['mage_1', 'mage_2'],
      // 三系各 5 个（火 / 冰 / 奥），共 15 个进入升级卡池；
      // 空格闪现是独立位移技能，不占技能格、不进卡池（见 displacement）。
      skills: [
        'fireball', 'pyroblast', 'flamestrike', 'dragon_breath', 'shockwave',
        'frostbolt', 'frost_nova', 'ice_barrier', 'blizzard', 'cone_of_cold',
        'arcane_missiles', 'arcane_explosion', 'arcane_power', 'arcane_torrent', 'arcane_field'
      ]
    }
  },

  /* ---------------- 技能 (每职业 15 个) ---------------- */
  skills: {
    /* ================= 战士 ================= */

    heroic_strike: {
      name: '英勇打击', icon: '⚔', color: '#ffd166', cls: 'warrior',
      desc: '朝最近敌人劈砍，命中扇形内所有敌人。',
      behavior: 'strike',
      lvl: [
        { cd: 1.20, dmg: 32, range: 120, arc: 1.75 },
        { cd: 1.10, dmg: 47, range: 126, arc: 1.81 },
        { cd: 1.00, dmg: 62, range: 132, arc: 1.88 },
        { cd: 0.90, dmg: 77, range: 139, arc: 1.95 },
        { cd: 0.80, dmg: 92, range: 145, arc: 2.01 }
      ]
    },

    cleave: {
      name: '顺劈斩', icon: '🪓', color: '#ffa94d', cls: 'warrior',
      desc: '宽扇形横扫，适合清理成群小怪。',
      behavior: 'strike',
      lvl: [
        { cd: 2.20, dmg: 24, range: 130, arc: 3.14 },
        { cd: 2.00, dmg: 36, range: 138, arc: 3.23 },
        { cd: 1.80, dmg: 47, range: 145, arc: 3.32 },
        { cd: 1.60, dmg: 58, range: 152, arc: 3.40 },
        { cd: 1.40, dmg: 70, range: 160, arc: 3.49 }
      ]
    },

    whirlwind: {
      name: '旋风斩', icon: '🌀', color: '#ffd166', cls: 'warrior',
      desc: '以自身为圆心旋转斩击周围所有敌人。',
      behavior: 'pbaoe',
      lvl: [
        { cd: 1.80, dmg: 20, radius: 110 },
        { cd: 1.63, dmg: 30, radius: 120 },
        { cd: 1.45, dmg: 39, radius: 130 },
        { cd: 1.28, dmg: 49, radius: 140 },
        { cd: 1.10, dmg: 58, radius: 150 }
      ]
    },

    shield_slam: {
      name: '盾牌猛击', icon: '🛡', color: '#e8e6d9', cls: 'warrior',
      desc: '窄扇形重击，击退命中的敌人。',
      behavior: 'strike',
      lvl: [
        { cd: 3.20, dmg: 38, range: 120, arc: 1.40, knock: 90 },
        { cd: 2.90, dmg: 55, range: 125, arc: 1.44, knock: 103 },
        { cd: 2.60, dmg: 72, range: 130, arc: 1.48, knock: 115 },
        { cd: 2.30, dmg: 88, range: 135, arc: 1.53, knock: 128 },
        { cd: 2.00, dmg: 105, range: 140, arc: 1.57, knock: 140 }
      ]
    },

    thunder_clap: {
      name: '雷霆一击', icon: '⚡', color: '#a29bfe', cls: 'warrior',
      desc: '震击周围敌人并减速。',
      behavior: 'pbaoe',
      lvl: [
        { cd: 4.00, dmg: 22, radius: 135, slow: 0.30, slowT: 1.5 },
        { cd: 3.65, dmg: 33, radius: 146, slow: 0.35, slowT: 1.75 },
        { cd: 3.30, dmg: 44, radius: 157, slow: 0.40, slowT: 2.0 },
        { cd: 2.95, dmg: 55, radius: 169, slow: 0.45, slowT: 2.25 },
        { cd: 2.60, dmg: 66, radius: 180, slow: 0.50, slowT: 2.5 }
      ]
    },

    charge: {
      name: '冲锋', icon: '🏃', color: '#ffd166', cls: 'warrior',
      desc: '空格触发：朝鼠标方向加速冲锋，撞伤路径上的敌人。',
      behavior: 'dash',
      displacement: 'charge',
      displacementType: 'charge',
      charges: 2,
      dashSpeed: 1050,
      lvl: [
        { cd: 8.0, recharge: 6.8, dmg: 28, distance: 220, radius: 70, invuln: 0.35, minDist: 140, maxDist: 360 },
        { cd: 7.25, recharge: 6.4, dmg: 42, distance: 235, radius: 75, invuln: 0.40, minDist: 140, maxDist: 360 },
        { cd: 6.50, recharge: 6.0, dmg: 57, distance: 250, radius: 80, invuln: 0.45, minDist: 140, maxDist: 360 },
        { cd: 5.75, recharge: 5.6, dmg: 71, distance: 265, radius: 85, invuln: 0.50, minDist: 140, maxDist: 360 },
        { cd: 5.00, recharge: 5.2, dmg: 85, distance: 280, radius: 90, invuln: 0.55, minDist: 140, maxDist: 360 }
      ]
    },

    rend: {
      name: '撕裂', icon: '🩸', color: '#ff6b6b', cls: 'warrior',
      desc: '劈砍并造成持续流血。',
      behavior: 'strike',
      lvl: [
        { cd: 5.0, dmg: 14, range: 115, arc: 2.09, dot: { dps: 10, t: 4 } },
        { cd: 4.5, dmg: 21, range: 120, arc: 2.18, dot: { dps: 16, t: 4.5 } },
        { cd: 4.0, dmg: 27, range: 125, arc: 2.27, dot: { dps: 21, t: 5 } },
        { cd: 3.5, dmg: 34, range: 130, arc: 2.35, dot: { dps: 27, t: 5.5 } },
        { cd: 3.0, dmg: 40, range: 135, arc: 2.44, dot: { dps: 32, t: 6 } }
      ]
    },

    execute: {
      name: '斩杀', icon: '💀', color: '#ff6b6b', cls: 'warrior',
      desc: '对残血目标造成额外伤害。',
      behavior: 'strike',
      lvl: [
        { cd: 4.20, dmg: 44, range: 115, arc: 1.57, execute: { threshold: 0.35, mult: 2.2 } },
        { cd: 3.80, dmg: 64, range: 121, arc: 1.62, execute: { threshold: 0.36, mult: 2.35 } },
        { cd: 3.40, dmg: 84, range: 127, arc: 1.66, execute: { threshold: 0.38, mult: 2.5 } },
        { cd: 3.00, dmg: 105, range: 134, arc: 1.71, execute: { threshold: 0.39, mult: 2.65 } },
        { cd: 2.60, dmg: 125, range: 140, arc: 1.75, execute: { threshold: 0.40, mult: 2.8 } }
      ]
    },

    victory_rush: {
      name: '胜利在望', icon: '🏆', color: '#ffd166', cls: 'warrior',
      desc: '击杀敌人时回复生命，有内置冷却。',
      behavior: 'onkill',
      lvl: [
        { cd: 0, healPct: 0.03, internalCd: 1.20 },
        { cd: 0, healPct: 0.04, internalCd: 1.05 },
        { cd: 0, healPct: 0.05, internalCd: 0.90 },
        { cd: 0, healPct: 0.06, internalCd: 0.75 },
        { cd: 0, healPct: 0.07, internalCd: 0.60 }
      ]
    },

    battle_shout: {
      name: '战斗怒吼', icon: '📢', color: '#ffa94d', cls: 'warrior',
      desc: '发出战吼，短时间提升全部伤害。',
      behavior: 'buff',
      lvl: [
        { cd: 14.0, duration: 6.0, dmgMul: 0.15 },
        { cd: 12.75, duration: 6.5, dmgMul: 0.19 },
        { cd: 11.50, duration: 7.0, dmgMul: 0.23 },
        { cd: 10.25, duration: 7.5, dmgMul: 0.26 },
        { cd: 9.00, duration: 8.0, dmgMul: 0.30 }
      ]
    },

    shield_wall: {
      name: '盾墙', icon: '🧱', color: '#e8e6d9', cls: 'warrior',
      desc: '举盾防御，提升护甲并获得护盾。',
      behavior: 'buff',
      lvl: [
        { cd: 18.0, duration: 5.0, armor: 0.25, shield: 70 },
        { cd: 16.5, duration: 5.5, armor: 0.30, shield: 102 },
        { cd: 15.0, duration: 6.0, armor: 0.35, shield: 135 },
        { cd: 13.5, duration: 6.5, armor: 0.40, shield: 168 },
        { cd: 12.0, duration: 7.0, armor: 0.45, shield: 200 }
      ]
    },

    revenge: {
      name: '复仇', icon: '💥', color: '#ff6b6b', cls: 'warrior',
      desc: '反击周围敌人，造成范围伤害。',
      behavior: 'pbaoe',
      lvl: [
        { cd: 5.0, dmg: 30, radius: 100 },
        { cd: 4.5, dmg: 44, radius: 109 },
        { cd: 4.0, dmg: 57, radius: 118 },
        { cd: 3.5, dmg: 71, radius: 126 },
        { cd: 3.0, dmg: 85, radius: 135 }
      ]
    },

    sunder_armor: {
      name: '破甲', icon: '🔨', color: '#ffa94d', cls: 'warrior',
      desc: '造成伤害并使目标易伤。',
      behavior: 'strike',
      lvl: [
        { cd: 7.0, dmg: 18, range: 115, arc: 1.75, vuln: 0.12, vulnT: 5.0 },
        { cd: 6.25, dmg: 27, range: 120, arc: 1.79, vuln: 0.15, vulnT: 5.5 },
        { cd: 5.50, dmg: 35, range: 125, arc: 1.83, vuln: 0.18, vulnT: 6.0 },
        { cd: 4.75, dmg: 44, range: 130, arc: 1.88, vuln: 0.21, vulnT: 6.5 },
        { cd: 4.00, dmg: 52, range: 135, arc: 1.92, vuln: 0.25, vulnT: 7.0 }
      ]
    },

    overpower: {
      name: '压制', icon: '🎯', color: '#ffd166', cls: 'warrior',
      desc: '必定暴击的强力斩击。',
      behavior: 'strike',
      lvl: [
        { cd: 5.0, dmg: 36, range: 110, arc: 1.57, crit: 1.6 },
        { cd: 4.5, dmg: 52, range: 115, arc: 1.62, crit: 1.7 },
        { cd: 4.0, dmg: 68, range: 120, arc: 1.66, crit: 1.8 },
        { cd: 3.5, dmg: 84, range: 125, arc: 1.71, crit: 1.9 },
        { cd: 3.0, dmg: 100, range: 130, arc: 1.75, crit: 2.0 }
      ]
    },

    bladestorm: {
      name: '剑刃风暴', icon: '🌪', color: '#ffd166', cls: 'warrior',
      desc: '持续旋转斩击周围敌人，期间可以移动。',
      behavior: 'channel',
      lvl: [
        { cd: 20.0, radius: 110, duration: 3.0, tick: 0.30, dmg: 12 },
        { cd: 18.5, radius: 120, duration: 3.1, tick: 0.28, dmg: 17 },
        { cd: 17.0, radius: 130, duration: 3.25, tick: 0.25, dmg: 21 },
        { cd: 15.5, radius: 140, duration: 3.4, tick: 0.22, dmg: 26 },
        { cd: 14.0, radius: 150, duration: 3.5, tick: 0.20, dmg: 30 }
      ]
    },

    /* ================= 法师 ================= */

    fireball: {
      name: '火球术', icon: '🔥', color: '#ff9f43', cls: 'mage',
      desc: '射出火球，命中后小范围爆炸。',
      behavior: 'projectile',
      lvl: [
        { cd: 1.50, dmg: 30, count: 1, speed: 300, range: 420, aoe: 55, size: 10 },
        { cd: 1.38, dmg: 43, count: 1, speed: 310, range: 435, aoe: 63, size: 10 },
        { cd: 1.25, dmg: 56, count: 1, speed: 320, range: 450, aoe: 70, size: 10 },
        { cd: 1.13, dmg: 69, count: 1, speed: 330, range: 465, aoe: 78, size: 10 },
        { cd: 1.00, dmg: 82, count: 1, speed: 340, range: 480, aoe: 85, size: 10 }
      ]
    },

    frostbolt: {
      name: '寒冰箭', icon: '❄', color: '#74c0fc', cls: 'mage',
      desc: '冰霜箭矢，造成伤害并减速。',
      behavior: 'projectile',
      lvl: [
        { cd: 1.10, dmg: 20, count: 1, speed: 460, range: 430, slow: 0.35, slowT: 2.0, size: 5 },
        { cd: 1.00, dmg: 29, count: 1, speed: 475, range: 443, slow: 0.40, slowT: 2.25, size: 5 },
        { cd: 0.90, dmg: 37, count: 1, speed: 490, range: 455, slow: 0.45, slowT: 2.5, size: 5 },
        { cd: 0.80, dmg: 46, count: 1, speed: 505, range: 468, slow: 0.50, slowT: 2.75, size: 6 },
        { cd: 0.70, dmg: 54, count: 1, speed: 520, range: 480, slow: 0.55, slowT: 3.0, size: 6 }
      ]
    },

    arcane_missiles: {
      name: '奥术飞弹', icon: '✨', color: '#b197fc', cls: 'mage',
      desc: '施放后 3 秒内连续放出多轮飞弹；飞弹随机四散射出，然后各自转弯追敌。',
      behavior: 'projectile',
      // volleys: 一轮几发; count: 每轮几枚; interval: 轮间隔; window: 齐射窗口(秒)
      // scatter: 出膛时的随机偏角(弧度), homing 会把它们拐回来
      lvl: [
        { cd: 6.00, dmg: 9, volleys: 4, count: 3, interval: 0.75, window: 3.0, speed: 330, range: 420, homing: 5.5, scatter: 1.15, size: 5 },
        { cd: 5.70, dmg: 11, volleys: 4, count: 3, interval: 0.62, window: 3.0, speed: 345, range: 430, homing: 6.0, scatter: 1.10, size: 5 },
        { cd: 5.40, dmg: 13, volleys: 5, count: 4, interval: 0.56, window: 3.0, speed: 360, range: 440, homing: 6.5, scatter: 1.05, size: 5 },
        { cd: 5.10, dmg: 15, volleys: 5, count: 5, interval: 0.50, window: 3.0, speed: 375, range: 450, homing: 7.0, scatter: 1.00, size: 6 },
        { cd: 4.80, dmg: 17, volleys: 6, count: 6, interval: 0.45, window: 3.0, speed: 390, range: 460, homing: 7.5, scatter: 0.95, size: 6 }
      ],
      up: [
        '飞弹伤害 9 → 11，单轮间隔 0.75s → 0.62s',
        '齐射轮次 4 → 5，每轮 3 → 4 枚，伤害 11 → 13',
        '每轮 4 → 5 枚，伤害 13 → 15，弹速 360 → 375',
        '齐射 6 轮 × 6 枚，伤害 15 → 17，追踪更灵敏'
      ]
    },

    frost_nova: {
      name: '冰霜新星', icon: '💫', color: '#74c0fc', cls: 'mage',
      desc: '冰霜爆发，对周围敌人造成伤害并大幅减速。',
      behavior: 'pbaoe',
      lvl: [
        { cd: 6.0, dmg: 26, radius: 140, slow: 0.60, slowT: 2.0 },
        { cd: 5.38, dmg: 38, radius: 153, slow: 0.65, slowT: 2.25 },
        { cd: 4.75, dmg: 49, radius: 165, slow: 0.70, slowT: 2.5 },
        { cd: 4.13, dmg: 61, radius: 178, slow: 0.75, slowT: 2.75 },
        { cd: 3.50, dmg: 72, radius: 190, slow: 0.80, slowT: 3.0 }
      ]
    },

    blink: {
      name: '闪现', icon: '🌌', color: '#b197fc', cls: 'mage',
      desc: '空格触发：瞬移到鼠标位置，落点短暂无敌。',
      behavior: 'dash',
      displacement: 'blink',
      displacementType: 'blink',
      charges: 2,
      lvl: [
        { cd: 9.0, recharge: 7.0, distance: 180, invuln: 0.50, triggerDist: 130 },
        { cd: 8.13, recharge: 6.6, distance: 195, invuln: 0.58, triggerDist: 130 },
        { cd: 7.25, recharge: 6.2, distance: 210, invuln: 0.65, triggerDist: 130 },
        { cd: 6.38, recharge: 5.8, distance: 225, invuln: 0.73, triggerDist: 130 },
        { cd: 5.50, recharge: 5.4, distance: 240, invuln: 0.80, triggerDist: 130 }
      ]
    },

    ice_barrier: {
      name: '冰霜屏障', icon: '🛡', color: '#74c0fc', cls: 'mage',
      desc: '凝聚冰霜护盾，吸收伤害。',
      behavior: 'buff',
      lvl: [
        { cd: 16.0, duration: 8.0, shield: 80 },
        { cd: 14.5, duration: 8.5, shield: 125 },
        { cd: 13.0, duration: 9.0, shield: 170 },
        { cd: 11.5, duration: 9.5, shield: 215 },
        { cd: 10.0, duration: 10.0, shield: 260 }
      ]
    },

    arcane_explosion: {
      name: '魔爆术', icon: '💠', color: '#b197fc', cls: 'mage',
      desc: '以自身为中心引爆奥术能量。',
      behavior: 'pbaoe',
      lvl: [
        { cd: 2.20, dmg: 20, radius: 110 },
        { cd: 2.00, dmg: 30, radius: 120 },
        { cd: 1.80, dmg: 39, radius: 130 },
        { cd: 1.60, dmg: 49, radius: 140 },
        { cd: 1.40, dmg: 58, radius: 150 }
      ]
    },

    pyroblast: {
      name: '炎爆术', icon: '☄', color: '#ff9f43', cls: 'mage',
      desc: '缓慢的巨大熔岩火球，命中爆炸并使敌人持续灼烧。',
      behavior: 'projectile',
      lvl: [
        { cd: 7.0, dmg: 90, count: 1, speed: 260, range: 460, aoe: 80, size: 10, dot: { dps: 14, t: 3 } },
        { cd: 6.38, dmg: 133, count: 1, speed: 270, range: 475, aoe: 90, size: 10, dot: { dps: 19, t: 3.5 } },
        { cd: 5.75, dmg: 175, count: 1, speed: 280, range: 490, aoe: 100, size: 11, dot: { dps: 24, t: 4 } },
        { cd: 5.13, dmg: 218, count: 1, speed: 290, range: 505, aoe: 110, size: 11, dot: { dps: 30, t: 4.5 } },
        { cd: 4.50, dmg: 260, count: 1, speed: 300, range: 520, aoe: 120, size: 12, dot: { dps: 36, t: 5 } }
      ]
    },

    blizzard: {
      name: '暴风雪', icon: '🌨', color: '#74c0fc', cls: 'mage',
      desc: '在敌人密集处降下暴风雪，持续伤害并减速。',
      behavior: 'ground',
      lvl: [
        { cd: 9.0, castRange: 320, radius: 130, duration: 3.0, tick: 0.5, dps: 15, slow: 0.30, slowT: 0.6 },
        { cd: 8.25, castRange: 330, radius: 143, duration: 3.5, tick: 0.5, dps: 23, slow: 0.35, slowT: 0.6 },
        { cd: 7.5, castRange: 340, radius: 155, duration: 4.0, tick: 0.5, dps: 30, slow: 0.40, slowT: 0.6 },
        { cd: 6.75, castRange: 350, radius: 168, duration: 4.5, tick: 0.5, dps: 38, slow: 0.45, slowT: 0.6 },
        { cd: 6.0, castRange: 360, radius: 180, duration: 5.0, tick: 0.5, dps: 45, slow: 0.50, slowT: 0.6 }
      ]
    },

    flamestrike: {
      name: '烈焰风暴', icon: '🌋', color: '#ff9f43', cls: 'mage',
      desc: '短暂延迟后，在目标区域爆发出烈焰。',
      behavior: 'ground',
      lvl: [
        { cd: 6.0, castRange: 300, radius: 110, delay: 0.35, dmg: 65 },
        { cd: 5.5, castRange: 310, radius: 120, delay: 0.35, dmg: 94 },
        { cd: 5.0, castRange: 320, radius: 130, delay: 0.35, dmg: 123 },
        { cd: 4.5, castRange: 330, radius: 140, delay: 0.35, dmg: 151 },
        { cd: 4.0, castRange: 340, radius: 150, delay: 0.35, dmg: 180 }
      ]
    },

    arcane_power: {
      name: '奥术强化', icon: '🔮', color: '#b197fc', cls: 'mage',
      desc: '短时间大幅提升全部伤害。',
      behavior: 'buff',
      lvl: [
        { cd: 16.0, duration: 6.0, dmgMul: 0.20 },
        { cd: 14.5, duration: 6.5, dmgMul: 0.25 },
        { cd: 13.0, duration: 7.0, dmgMul: 0.30 },
        { cd: 11.5, duration: 7.5, dmgMul: 0.35 },
        { cd: 10.0, duration: 8.0, dmgMul: 0.40 }
      ]
    },

    shockwave: {
      name: '冲击波', icon: '💥', color: '#ff8c42', cls: 'mage',
      desc: '以自身为中心炸开火焰，击退范围内所有敌人，并留下短暂灼烧。',
      behavior: 'pbaoe',
      lvl: [
        { cd: 4.80, dmg: 30, radius: 115, knock: 120, dot: { dps: 6, t: 1.5 } },
        { cd: 4.45, dmg: 42, radius: 130, knock: 140, dot: { dps: 8, t: 1.75 } },
        { cd: 4.10, dmg: 54, radius: 143, knock: 160, dot: { dps: 10, t: 2.0 } },
        { cd: 3.75, dmg: 66, radius: 157, knock: 180, dot: { dps: 12, t: 2.25 } },
        { cd: 3.40, dmg: 78, radius: 172, knock: 200, dot: { dps: 14, t: 2.5 } }
      ],
      up: [
        '伤害 30 → 42，半径 115 → 130，击退 +20',
        '伤害 54，半径 143，灼烧 10/s × 2s',
        '伤害 66，半径 157，击退 180',
        '伤害 78，半径 172，冷却 3.4s'
      ]
    },

    dragon_breath: {
      name: '龙息', icon: '🐉', color: '#ff9f43', cls: 'mage',
      desc: '喷出锥形烈焰，并造成持续灼烧。',
      behavior: 'strike',
      lvl: [
        { cd: 7.0, dmg: 35, range: 150, arc: 1.40, dot: { dps: 10, t: 3 } },
        { cd: 6.38, dmg: 50, range: 158, arc: 1.48, dot: { dps: 15, t: 3.5 } },
        { cd: 5.75, dmg: 65, range: 165, arc: 1.57, dot: { dps: 20, t: 4 } },
        { cd: 5.13, dmg: 80, range: 173, arc: 1.66, dot: { dps: 25, t: 4.5 } },
        { cd: 4.50, dmg: 95, range: 180, arc: 1.75, dot: { dps: 30, t: 5 } }
      ]
    },

    cone_of_cold: {
      name: '冰锥术', icon: '🌬', color: '#74c0fc', cls: 'mage',
      desc: '锥形寒冰，造成伤害并减速。',
      behavior: 'strike',
      lvl: [
        { cd: 5.0, dmg: 22, range: 160, arc: 1.57, slow: 0.50, slowT: 2.0 },
        { cd: 4.5, dmg: 32, range: 170, arc: 1.66, slow: 0.55, slowT: 2.25 },
        { cd: 4.0, dmg: 41, range: 180, arc: 1.75, slow: 0.60, slowT: 2.5 },
        { cd: 3.5, dmg: 51, range: 190, arc: 1.83, slow: 0.65, slowT: 2.75 },
        { cd: 3.0, dmg: 60, range: 200, arc: 1.92, slow: 0.70, slowT: 3.0 }
      ]
    },

    arcane_field: {
      name: '奥术力场', icon: '❇', color: '#b197fc', cls: 'mage',
      desc: '在自身周围展开力场并跟随移动，持续伤害并大幅减速其中的敌人。',
      behavior: 'field',
      // follow: 力场跟着玩家走; 长持续 / 低 DPS / 强减速, 和暴风雪的远程高 DPS 分工
      lvl: [
        { cd: 12.0, radius: 120, duration: 7.0, tick: 0.5, dps: 10, slow: 0.45, slowT: 0.6 },
        { cd: 11.0, radius: 137, duration: 7.5, tick: 0.5, dps: 13, slow: 0.50, slowT: 0.6 },
        { cd: 10.0, radius: 153, duration: 8.0, tick: 0.5, dps: 16, slow: 0.55, slowT: 0.65 },
        { cd: 9.0, radius: 170, duration: 8.5, tick: 0.5, dps: 19, slow: 0.60, slowT: 0.7 },
        { cd: 8.0, radius: 187, duration: 9.0, tick: 0.5, dps: 22, slow: 0.65, slowT: 0.75 }
      ],
      up: [
        '半径 120 → 137，减速 45% → 50%',
        '每秒伤害 13 → 16，持续 8s',
        '半径 170，减速 60%，每秒 19',
        '半径 187，减速 65%，冷却 8s，持续 9s'
      ]
    },

    arcane_torrent: {
      name: '奥术洪流', icon: '⚡', color: '#b197fc', cls: 'mage',
      desc: '锁定方向射出持续的柱状奥术能量波，穿透沿途所有敌人；引导期间自身减速。',
      behavior: 'beam',
      // length/width: 柱体尺寸; tick: 每跳间隔; slowSelf: 引导时自身移速惩罚
      lvl: [
        { cd: 8.0, duration: 2.0, width: 46, length: 360, tick: 0.20, dmg: 12, slowSelf: 0.30 },
        { cd: 7.3, duration: 2.3, width: 53, length: 385, tick: 0.20, dmg: 17, slowSelf: 0.27 },
        { cd: 6.6, duration: 2.6, width: 60, length: 410, tick: 0.19, dmg: 22, slowSelf: 0.24 },
        { cd: 5.9, duration: 2.9, width: 67, length: 435, tick: 0.18, dmg: 27, slowSelf: 0.20 },
        { cd: 5.2, duration: 3.2, width: 74, length: 460, tick: 0.17, dmg: 32, slowSelf: 0.16 }
      ],
      up: [
        '持续 2.3s，宽度 46 → 53，伤害 12 → 17',
        '持续 2.6s，宽度 60，冷却 -0.7s',
        '持续 2.9s，宽度 67，伤害 27，引导减速减轻',
        '持续 3.2s，宽度 74，伤害 32，冷却 5.2s'
      ]
    }
  },

  /* ---------------- 被动 ---------------- */
  passives: {
    might:   { name: '力量', icon: '💪', desc: '全部伤害 +12%', max: 5, apply: (p, l) => { p.dmgMul += 0.12 * l; } },
    haste:   { name: '急速', icon: '⏱', desc: '冷却 -8%',      max: 5, apply: (p, l) => { p.cdMul *= Math.pow(0.92, l); } },
    boots:   { name: '疾行', icon: '👟', desc: '移动速度 +14',  max: 5, apply: (p, l) => { p.speed += 14 * l; } },
    vigor:   { name: '体魄', icon: '❤', desc: '最大生命 +22',  max: 5, apply: (p, l) => { p.maxHp += 22 * l; } },
    regen:   { name: '再生', icon: '✚', desc: '每秒回复 +0.8',  max: 5, apply: (p, l) => { p.regen += 0.8 * l; } },
    magnet:  { name: '磁吸', icon: '🧲', desc: '拾取范围 +45',  max: 3, apply: (p, l) => { p.magnet += 45 * l; } },
    growth:  { name: '学识', icon: '📖', desc: '获得经验 +18%', max: 4, apply: (p, l) => { p.xpMul += 0.18 * l; } },
    armor:   { name: '护甲', icon: '🛡', desc: '受到伤害 -8%',  max: 5, apply: (p, l) => { p.armor += 0.08 * l; } },
    area:    { name: '扩张', icon: '◎', desc: '技能范围 +10%', max: 4, apply: (p, l) => { p.areaMul += 0.10 * l; } }
  },

  /* ---------------- 普通敌人 ---------------- */
  enemies: {
    slime: {
      name: '腐化史莱姆', hp: 8, speed: 100, dmg: 5, r: 13, xp: 1,
      color: '#5be08a', ai: 'chase', sides: 6
    },
    bat: {
      name: '夜蝠', hp: 6, speed: 152, dmg: 4, r: 10, xp: 1,
      color: '#c77dff', ai: 'erratic', sides: 3
    },
    skeleton: {
      name: '骸骨兵', hp: 24, speed: 118, dmg: 8, r: 14, xp: 2,
      color: '#e8e6d9', ai: 'chase', sides: 4
    },
    shooter: {
      name: '咒术师', hp: 18, speed: 95, dmg: 6, r: 13, xp: 2,
      color: '#ffa94d', ai: 'ranged', sides: 5, fireCd: 3.6, bulletSpeed: 188
    },
    brute: {
      name: '石魔', hp: 90, speed: 78, dmg: 12, r: 24, xp: 4,
      color: '#ff6b6b', ai: 'chase', sides: 8
    },
    totem: {
      name: '巫毒图腾', hp: 55, speed: 0, dmg: 0, r: 15, xp: 0,
      color: '#c77dff', ai: 'totem', sides: 5,
      fireCd: 1.6, bulletSpeed: 220, bulletDmg: 9, life: 8
    }
  },

  /* ---------------- 5 阶 Boss ---------------- */
  bosses: [
    {
      tier: 1, name: '深渊之眼', hp: 1600, dmg: 24, speed: 86, r: 46, xp: 180,
      color: '#b197fc', ai: 'boss', sides: 12,
      burst: 14, rings: 1, burstEvery: 3.0,
      aimed: 0, aimedEvery: 4.0,
      summons: 5, summonEvery: 9.0
    },
    {
      tier: 2, name: '裂隙之瞳', hp: 3200, dmg: 30, speed: 90, r: 50, xp: 260,
      color: '#8ce99a', ai: 'boss', sides: 12,
      burst: 16, rings: 1, burstEvery: 3.0,
      aimed: 3, aimedEvery: 4.0,
      summons: 6, summonEvery: 8.0
    },
    {
      tier: 3, name: '虚空之眼', hp: 5600, dmg: 38, speed: 94, r: 54, xp: 360,
      color: '#74c0fc', ai: 'boss', sides: 12,
      burst: 18, rings: 2, burstEvery: 3.0,
      aimed: 3, aimedEvery: 3.5,
      summons: 7, summonEvery: 7.0
    },
    {
      tier: 4, name: '湮灭之瞳', hp: 9000, dmg: 48, speed: 98, r: 58, xp: 480,
      color: '#ffa94d', ai: 'boss', sides: 12,
      burst: 20, rings: 2, burstEvery: 3.0,
      aimed: 5, aimedEvery: 3.0,
      summons: 8, summonEvery: 6.0
    },
    {
      tier: 5, name: '终焉之眼', hp: 14000, dmg: 60, speed: 102, r: 62, xp: 650,
      color: '#ff6b8b', ai: 'boss', sides: 12,
      burst: 24, rings: 3, burstEvery: 2.5,
      aimed: 7, aimedEvery: 2.5,
      summons: 10, summonEvery: 5.0
    }
  ],

  /* 每阶额外 1 个异族 Boss，与上面的眼球 Boss 各 50% 概率出现。
     数值默认继承同阶 Boss，只覆盖名字/配色/召唤物/特色机制。 */
  bossAlts: [
    {
      tier: 1, key: 'boar_king', name: '血牙野猪王', tag: '野兽',
      color: '#e0a458', summonType: 'bat', summons: 3, summonEvery: 10.0,
      mechanic: 'charge', mechEvery: 7.0, chargeSpeed: 500, chargeTime: 0.38,
      desc: '蓄力后直线冲锋，撞上会掉一大截血。'
    },
    {
      tier: 2, key: 'stitched_abomination', name: '缝尸憎恶', tag: '亡灵',
      color: '#9ae66e', summonType: 'skeleton', summons: 5, summonEvery: 8.0,
      mechanic: 'poison', mechEvery: 7.0,
      poisonR: 120, poisonMul: 0.25, poisonDuration: 6,
      desc: '在脚下放毒云，逼你离开原地。'
    },
    {
      tier: 3, key: 'voodoo_hexer', name: '巫毒妖术师', tag: '巨魔',
      color: '#c77dff', summonType: 'skeleton', summons: 4, summonEvery: 9.0,
      mechanic: 'totem', mechEvery: 9.0, totemCount: 2,
      desc: '插下会放暗影弹的巫毒图腾。'
    },
    {
      tier: 4, key: 'magma_tyrant', name: '熔岩暴君', tag: '恶魔',
      color: '#ff8c42', summonType: 'shooter', summons: 4, summonEvery: 8.0,
      mechanic: 'firerain', mechEvery: 7.5,
      meteorCount: 3, meteorR: 85, meteorMul: 0.55,
      desc: '召唤熔岩火雨，地面会先亮起预警圈。'
    },
    {
      tier: 5, key: 'doom_dragon', name: '末日巨龙', tag: '巨龙',
      color: '#ff5d5d', summonType: 'shooter', summons: 5, summonEvery: 7.0,
      mechanic: 'breath', mechEvery: 6.0,
      breathCount: 9, breathSpread: 0.7, breathMul: 0.40,
      desc: '蓄力后喷出扇形龙息。'
    }
  ],

  /* ---------------- 波次 (按时间取材) ---------------- */
  waves: [
    { t: 0,   types: ['slime'],                                  interval: 1.20, batch: 2 },
    { t: 30,  types: ['slime', 'bat'],                           interval: 1.10, batch: 2 },
    { t: 60,  types: ['slime', 'bat', 'skeleton'],               interval: 1.00, batch: 2 },
    { t: 100, types: ['bat', 'skeleton', 'shooter'],             interval: 1.00, batch: 3 },
    { t: 150, types: ['skeleton', 'shooter', 'brute'],           interval: 0.90, batch: 3 },
    { t: 200, types: ['bat', 'skeleton', 'shooter', 'brute'],    interval: 0.85, batch: 3 },
    { t: 260, types: ['bat', 'skeleton', 'shooter', 'brute'],    interval: 0.80, batch: 3 },
    { t: 320, types: ['bat', 'skeleton', 'shooter', 'brute'],    interval: 0.75, batch: 4 },
    { t: 380, types: ['bat', 'skeleton', 'shooter', 'brute'],    interval: 0.70, batch: 4 },
    { t: 440, types: ['bat', 'skeleton', 'shooter', 'brute'],    interval: 0.65, batch: 5 },
    { t: 500, types: ['bat', 'skeleton', 'shooter', 'brute'],    interval: 0.60, batch: 5 },
    { t: 560, types: ['bat', 'skeleton', 'shooter', 'brute'],    interval: 0.55, batch: 6 }
  ],

  /* ---------------- 素材路径 ----------------
     现在是字符串; 以后要做序列帧就改成
     { src: 'player/warrior_1.png', frames: 4, frameW: 256, frameH: 256, fps: 8 }
     图片不存在时自动回退到矢量画法。 */
  assets: {
    basePath: 'assets/',
    player: {
      warrior_1: 'player/warrior_1.png',
      // 四方向朝向图集: 4 帧横排 512x512, 帧序 = 东南/南/西南/北
      warrior_1_dir: { src: 'player/warrior_1_dir.png', frames: 4, frameW: 512, frameH: 512, fps: 0 },
      warrior_2: 'player/warrior_2.png',
      warrior_2_dir: { src: 'player/warrior_2_dir.png', frames: 4, frameW: 512, frameH: 512, fps: 0 },
      mage_1: 'player/mage_1.png',
      mage_1_dir: { src: 'player/mage_1_dir.png', frames: 4, frameW: 512, frameH: 512, fps: 0 },
      mage_2: 'player/mage_2.png',
      mage_2_dir: { src: 'player/mage_2_dir.png', frames: 4, frameW: 512, frameH: 512, fps: 0 }
    },
    background: {
      1: 'background/scene_1.png',
      2: 'background/scene_2.png',
      3: 'background/scene_3.png'
    },
    enemy: {
      slime: 'enemy/slime.png',
      bat: 'enemy/bat.png',
      skeleton: 'enemy/skeleton.png',
      shooter: 'enemy/shooter.png',
      brute: 'enemy/brute.png',
      totem: 'enemy/totem.png'
    },
    boss: {
      1: 'boss/abyss_eye_1.png',
      2: 'boss/abyss_eye_2.png',
      3: 'boss/abyss_eye_3.png',
      4: 'boss/abyss_eye_4.png',
      5: 'boss/abyss_eye_5.png',
      boar_king: 'boss/boar_king.png',
      stitched_abomination: 'boss/stitched_abomination.png',
      voodoo_hexer: 'boss/voodoo_hexer.png',
      magma_tyrant: 'boss/magma_tyrant.png',
      doom_dragon: 'boss/doom_dragon.png'
    },
    skill: {
      heroic_strike: 'skill/heroic_strike.png',
      cleave: 'skill/cleave.png',
      whirlwind: 'skill/whirlwind.png',
      shield_slam: 'skill/shield_slam.png',
      thunder_clap: 'skill/thunder_clap.png',
      charge: 'skill/charge.png',
      rend: 'skill/rend.png',
      execute: 'skill/execute.png',
      victory_rush: 'skill/victory_rush.png',
      battle_shout: 'skill/battle_shout.png',
      shield_wall: 'skill/shield_wall.png',
      revenge: 'skill/revenge.png',
      sunder_armor: 'skill/sunder_armor.png',
      overpower: 'skill/overpower.png',
      bladestorm: 'skill/bladestorm.png',
      fireball: 'skill/fireball.png',
      frostbolt: 'skill/frostbolt.png',
      arcane_missiles: 'skill/arcane_missiles.png',
      frost_nova: 'skill/frost_nova.png',
      blink: 'skill/blink.png',
      ice_barrier: 'skill/ice_barrier.png',
      arcane_explosion: 'skill/arcane_explosion.png',
      pyroblast: 'skill/pyroblast.png',
      blizzard: 'skill/blizzard.png',
      flamestrike: 'skill/flamestrike.png',
      arcane_power: 'skill/arcane_power.png',
      shockwave: 'skill/shockwave.png',
      dragon_breath: 'skill/dragon_breath.png',
      cone_of_cold: 'skill/cone_of_cold.png',
      arcane_field: 'skill/arcane_field.png',
      arcane_torrent: 'skill/arcane_torrent.png'
    },
    talent: {
      arms_core: 'talent/arms_core.png',
      arms_vit: 'talent/arms_vit.png',
      arms_power: 'talent/arms_power.png',
      arms_util: 'talent/arms_util.png',
      arms_key: 'talent/arms_key.png',
      fury_core: 'talent/fury_core.png',
      fury_vit: 'talent/fury_vit.png',
      fury_power: 'talent/fury_power.png',
      fury_util: 'talent/fury_util.png',
      fury_key: 'talent/fury_key.png',
      protection_core: 'talent/protection_core.png',
      protection_vit: 'talent/protection_vit.png',
      protection_power: 'talent/protection_power.png',
      protection_util: 'talent/protection_util.png',
      protection_key: 'talent/protection_key.png',
      fire_core: 'talent/fire_core.png',
      fire_vit: 'talent/fire_vit.png',
      fire_power: 'talent/fire_power.png',
      fire_util: 'talent/fire_util.png',
      fire_key: 'talent/fire_key.png',
      frost_core: 'talent/frost_core.png',
      frost_vit: 'talent/frost_vit.png',
      frost_power: 'talent/frost_power.png',
      frost_util: 'talent/frost_util.png',
      frost_key: 'talent/frost_key.png',
      arcane_core: 'talent/arcane_core.png',
      arcane_vit: 'talent/arcane_vit.png',
      arcane_power: 'talent/arcane_power.png',
      arcane_util: 'talent/arcane_util.png',
      arcane_key: 'talent/arcane_key.png'
    },
    fx: {
      fireball_impact: 'fx/fireball_impact.png',
      fireball_flight: 'fx/fireball_flight.png',
      flamestrike_ground: 'fx/flamestrike_ground.png',
      flamestrike_burst: 'fx/flamestrike_burst.png',
      pyroblast_flight: 'fx/pyroblast_flight.png',
      pyroblast_impact: 'fx/pyroblast_impact.png',
      dragon_breath: 'fx/dragon_breath.png',
      // v0.9: 冰系 / 奥术系关键形态贴图
      frostbolt_flight: 'fx/frostbolt_flight.png',
      frostbolt_impact: 'fx/frostbolt_impact.png',
      frost_nova: 'fx/frost_nova.png',
      blizzard_ground: 'fx/blizzard_ground.png',
      arcane_missiles_flight: 'fx/arcane_missiles_flight.png',
      arcane_field_ground: 'fx/arcane_field_ground.png'
    }
  }
};

/* 生成升级文案 */
for (const id in CONTENT.skills) {
  const def = CONTENT.skills[id];
  if (!def.up) def.up = autoUp(def);
}

/* ---------------- 技能特效风格 ----------------
   只影响表现, 不影响数值。vfx.js 按这里的风格选择配色与粒子形态:
   gold/holy 斩击, blood 血爪, thunder 闪电, fire/pyro 火焰,
   ice 冰霜, arcane 奥术, dragon 龙息, nature 治疗。 */
CONTENT.skillFx = {
  heroic_strike: 'gold',
  cleave: 'gold',
  whirlwind: 'gold',
  shield_slam: 'holy',
  thunder_clap: 'thunder',
  charge: 'gold',
  rend: 'blood',
  execute: 'blood',
  victory_rush: 'nature',
  battle_shout: 'gold',
  shield_wall: 'holy',
  revenge: 'blood',
  sunder_armor: 'gold',
  overpower: 'gold',
  bladestorm: 'gold',

  fireball: 'fire',
  frostbolt: 'ice',
  arcane_missiles: 'arcane',
  frost_nova: 'ice',
  blink: 'arcane',
  ice_barrier: 'ice',
  arcane_explosion: 'arcane',
  pyroblast: 'pyro',
  blizzard: 'ice',
  flamestrike: 'fire',
  arcane_power: 'arcane',
  shockwave: 'fire',
  dragon_breath: 'dragon',
  cone_of_cold: 'ice',
  arcane_field: 'arcane',
  arcane_torrent: 'arcane'
};

for (const id in CONTENT.skillFx) {
  if (CONTENT.skills[id] && !CONTENT.skills[id].fx) CONTENT.skills[id].fx = CONTENT.skillFx[id];
}

/* 位移技能的默认方向 */
CONTENT.skills.charge.lvl.forEach(s => { s.mode = 'toward'; });
CONTENT.skills.blink.lvl.forEach(s => { s.mode = 'away'; });

/* 防御/续航类技能: AI 自动选择时优先补一个, 人类不受影响 */
CONTENT.defensiveSkills = {
  battle_shout: 1,
  shield_wall: 1,
  victory_rush: 1,
  blink: 1,
  ice_barrier: 1
};

/* 清群技能: AI 自动选择时保证至少一把, 人类不受影响 */
CONTENT.aoeSkills = {
  cleave: 1,
  whirlwind: 1,
  thunder_clap: 1,
  revenge: 1,
  rend: 1,
  bladestorm: 1,
  fireball: 1,
  frost_nova: 1,
  arcane_explosion: 1,
  pyroblast: 1,
  blizzard: 1,
  flamestrike: 1,
  dragon_breath: 1,
  cone_of_cold: 1,
  arcane_torrent: 1,
  shockwave: 1,
  arcane_field: 1
};

/* 真正能快速清场的技能: 优先于普通新技能 */
CONTENT.strongAoeSkills = {
  cleave: 1,
  whirlwind: 1,
  thunder_clap: 1,
  bladestorm: 1,
  frost_nova: 1,
  arcane_explosion: 1,
  blizzard: 1,
  flamestrike: 1,
  dragon_breath: 1,
  cone_of_cold: 1,
  arcane_torrent: 1,
  shockwave: 1
};

/* 法师在风筝距离也能命中的强 AoE: AI 只把这些当作优先清场 */
CONTENT.mageStrongAoe = {
  blizzard: 1,
  flamestrike: 1,
  arcane_torrent: 1,
  pyroblast: 1,
  arcane_field: 1
};

/* 防御型被动: AI 会优先补 */
CONTENT.defensivePassives = {
  vigor: 1,
  armor: 1,
  regen: 1,
  boots: 1
};

/* 远程技能 / 近身技能: AI 法师更偏好能在风筝距离命中的技能 */
CONTENT.rangedSkills = {
  fireball: 1,
  frostbolt: 1,
  arcane_missiles: 1,
  pyroblast: 1,
  blizzard: 1,
  flamestrike: 1,
  arcane_torrent: 1,
  arcane_power: 1,
  ice_barrier: 1,
  blink: 1
};

CONTENT.closeRangeSkills = {
  dragon_breath: 1,
  cone_of_cold: 1,
  frost_nova: 1,
  arcane_explosion: 1,
  shockwave: 1,
  whirlwind: 1,
  cleave: 1,
  thunder_clap: 1,
  rend: 1,
  bladestorm: 1,
  shield_slam: 1
};
