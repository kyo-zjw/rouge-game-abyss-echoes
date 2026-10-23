/* =========================================================
   深渊回响 — 元进度 v0.7
   金币配置 + 三系天赋树（每系 6 环 / 10 节点）+ 纯函数。
   内容表只描述「数据」，购买 / 洗点 / 聚合 / 侵蚀都在 Talents 里。
   ========================================================= */

'use strict';

/* ---------------- 金币 ---------------- */
CONTENT.gold = {
  mobChance: 0.03,
  mobValue: 1,
  eliteChance: 0.12,
  eliteValue: 3,
  boss: [30, 50, 80, 120, 200],
  winBonus: 100
};

/* ---------------- 节点构造 ---------------- */
const TALENT_RING_RADII = [0.18, 0.33, 0.48, 0.63, 0.79, 0.96];
const TALENT_COST = {
  core: [50, 75, 110],
  skill: [65, 95, 135],
  vitality: [50, 75, 110],
  power: [60, 90, 130],
  utility: [55, 80, 115],
  keystone: [700]
};

function talentNode(id, ring, offset, name, icon, type, cost, req, effect, reqRank) {
  return {
    id: id,
    ring: ring,
    offset: offset,
    name: name,
    icon: icon,
    type: type,
    cost: cost.slice(),
    req: req.slice(),
    reqRank: reqRank || 1,
    effect: effect
  };
}

/* 每系固定骨架：core / skill1 / vitality / skill2 / skill3 /
   power / skill4 / skill5 / utility / keystone */
function makeBranch(o) {
  const id = k => o.id + '.' + k;
  const core = id('core');
  const skill1 = id('skill1');
  const vitality = id('vitality');
  const skill2 = id('skill2');
  const skill3 = id('skill3');
  const power = id('power');
  const skill4 = id('skill4');
  const skill5 = id('skill5');
  const utility = id('utility');

  return {
    id: o.id,
    name: o.name,
    color: o.color,
    angle: o.angle,
    skills: o.skills.slice(),
    nodes: [
      talentNode(core, 1, 0, o.core.name, o.core.icon, 'core',
        TALENT_COST.core, [], { branchDmg: 0.04 }),

      talentNode(skill1, 2, -16, o.s1.name, o.s1.icon, 'skill',
        TALENT_COST.skill, [core], o.s1.effect),
      talentNode(vitality, 2, 16, o.vit.name, o.vit.icon, 'vitality',
        TALENT_COST.vitality, [core], { hpPct: 0.05 }),

      talentNode(skill2, 3, -20, o.s2.name, o.s2.icon, 'skill',
        TALENT_COST.skill, [skill1], o.s2.effect),
      talentNode(skill3, 3, 20, o.s3.name, o.s3.icon, 'skill',
        TALENT_COST.skill, [vitality], o.s3.effect),

      talentNode(power, 4, -14, o.power.name, o.power.icon, 'power',
        TALENT_COST.power, [skill2], { dmgPct: 0.03 }),
      talentNode(skill4, 4, 14, o.s4.name, o.s4.icon, 'skill',
        TALENT_COST.skill, [skill3], o.s4.effect),

      talentNode(skill5, 5, -16, o.s5.name, o.s5.icon, 'skill',
        TALENT_COST.skill, [skill4], o.s5.effect),
      talentNode(utility, 5, 16, o.util.name, o.util.icon, 'utility',
        TALENT_COST.utility, [power], o.util.effect),

      talentNode(id('keystone'), 6, 0, o.key.name, o.key.icon, 'keystone',
        TALENT_COST.keystone, [skill5, utility], o.key.effect, 2)
    ]
  };
}

/* ---------------- 三系天赋树 ---------------- */
CONTENT.talentTrees = {
  warrior: {
    branches: [
      makeBranch({
        id: 'arms', name: '武器', color: '#ffd166', angle: -Math.PI / 2,
        skills: ['heroic_strike', 'cleave', 'rend', 'sunder_armor', 'overpower'],
        core: { name: '武器精通', icon: '⚔' },
        vit: { name: '钢铁体魄', icon: '❤' },
        power: { name: '杀意', icon: '🔺' },
        util: { name: '战场老兵', icon: '🛡', effect: { armorAdd: 0.03 } },
        s1: { name: '英勇打击', icon: '⚔', effect: { skills: { heroic_strike: { dmg: 0.08, cd: -0.03 } } } },
        s2: { name: '顺劈斩', icon: '🪓', effect: { skills: { cleave: { dmg: 0.08, area: 0.04 } } } },
        s3: { name: '撕裂', icon: '🩸', effect: { skills: { rend: { dmg: 0.08, dot: 0.08 } } } },
        s4: { name: '破甲', icon: '🔨', effect: { skills: { sunder_armor: { dmg: 0.08, vuln: 0.04 } } } },
        s5: { name: '压制', icon: '🎯', effect: { skills: { overpower: { dmg: 0.08, cd: -0.03 } } } },
        key: { name: '武器宗师', icon: '👑', effect: { branchDmg: 0.25, branchArea: 0.10 } }
      }),
      makeBranch({
        id: 'fury', name: '狂怒', color: '#ff6b6b', angle: Math.PI / 6,
        skills: ['whirlwind', 'execute', 'victory_rush', 'bladestorm', 'revenge'],
        core: { name: '狂怒精通', icon: '🔥' },
        vit: { name: '狂野之心', icon: '❤' },
        power: { name: '暴怒', icon: '🔺' },
        util: { name: '迅捷', icon: '👟', effect: { speedAdd: 5 } },
        s1: { name: '旋风斩', icon: '🌀', effect: { skills: { whirlwind: { dmg: 0.08, area: 0.04 } } } },
        s2: { name: '斩杀', icon: '💀', effect: { skills: { execute: { dmg: 0.08, cd: -0.03 } } } },
        s3: { name: '胜利在望', icon: '🏆', effect: { skills: { victory_rush: { heal: 0.08, internal: -0.03 } } } },
        s4: { name: '剑刃风暴', icon: '🌪', effect: { skills: { bladestorm: { dmg: 0.08, area: 0.04 } } } },
        s5: { name: '复仇', icon: '💥', effect: { skills: { revenge: { dmg: 0.08, cd: -0.03 } } } },
        key: {
          name: '狂怒化身', icon: '👹',
          effect: { branchDmg: 0.20, onKillHaste: { mul: 1.25, duration: 2 } }
        }
      }),
      makeBranch({
        id: 'protection', name: '防护', color: '#63e6ff', angle: Math.PI * 5 / 6,
        skills: ['shield_slam', 'thunder_clap', 'shield_wall', 'charge', 'battle_shout'],
        core: { name: '守护精通', icon: '🛡' },
        vit: { name: '不屈', icon: '❤' },
        power: { name: '重击', icon: '🔺' },
        util: { name: '再生', icon: '✚', effect: { regenAdd: 0.5 } },
        s1: { name: '盾牌猛击', icon: '🛡', effect: { skills: { shield_slam: { dmg: 0.08, knock: 0.08 } } } },
        s2: { name: '雷霆一击', icon: '⚡', effect: { skills: { thunder_clap: { dmg: 0.08, area: 0.04 } } } },
        s3: { name: '盾墙', icon: '🧱', effect: { skills: { shield_wall: { shield: 0.10, duration: 0.04 } } } },
        s4: { name: '冲锋', icon: '🏃', effect: { skills: { charge: { cd: -0.05, dist: 0.04 } } } },
        s5: { name: '战斗怒吼', icon: '📢', effect: { skills: { battle_shout: { buff: 0.08, duration: 0.04 } } } },
        key: { name: '不屈壁垒', icon: '🏰', effect: { hpPct: 0.15, armorAdd: 0.08, regenAdd: 2 } }
      })
    ]
  },

  mage: {
    branches: [
      makeBranch({
        id: 'fire', name: '火焰', color: '#ff9f43', angle: -Math.PI / 2,
        skills: ['fireball', 'pyroblast', 'flamestrike', 'dragon_breath'],
        core: { name: '火焰精通', icon: '🔥' },
        vit: { name: '炽热之躯', icon: '❤' },
        power: { name: '燃烧', icon: '🔺' },
        util: { name: '蔓延', icon: '◎', effect: { areaPct: 0.04 } },
        s1: { name: '火球术', icon: '🔥', effect: { skills: { fireball: { dmg: 0.08, cd: -0.03 } } } },
        s2: { name: '炎爆术', icon: '☄', effect: { skills: { pyroblast: { dmg: 0.08, area: 0.04 } } } },
        s3: { name: '烈焰风暴', icon: '🌋', effect: { skills: { flamestrike: { dmg: 0.08, area: 0.04 } } } },
        s4: { name: '龙息', icon: '🐉', effect: { skills: { dragon_breath: { dmg: 0.08, dot: 0.08 } } } },
        s5: {
          name: '余烬', icon: '✨',
          effect: { skills: { fireball: { dmg: 0.04, cd: -0.02 }, pyroblast: { dmg: 0.04, cd: -0.02 } } }
        },
        key: { name: '火焰主宰', icon: '👑', effect: { branchDmg: 0.20, branchArea: 0.12 } }
      }),
      makeBranch({
        id: 'frost', name: '冰霜', color: '#74c0fc', angle: Math.PI / 6,
        skills: ['frostbolt', 'frost_nova', 'ice_barrier', 'ice_block', 'blizzard', 'cone_of_cold'],
        core: { name: '冰霜精通', icon: '❄' },
        vit: { name: '寒冰护体', icon: '❤' },
        power: { name: '刺骨', icon: '🔺' },
        util: { name: '坚冰', icon: '🛡', effect: { armorAdd: 0.02 } },
        s1: { name: '寒冰箭', icon: '❄', effect: { skills: { frostbolt: { dmg: 0.08, slow: 0.04 } } } },
        s2: { name: '冰霜新星', icon: '💫', effect: { skills: { frost_nova: { dmg: 0.08, area: 0.04 } } } },
        s3: {
          name: '霜甲', icon: '🧊',
          effect: { skills: { ice_barrier: { shield: 0.10, duration: 0.04 }, ice_block: { duration: 0.05 } } }
        },
        s4: { name: '暴风雪', icon: '🌨', effect: { skills: { blizzard: { dmg: 0.08, area: 0.04 } } } },
        s5: { name: '冰锥术', icon: '🌬', effect: { skills: { cone_of_cold: { dmg: 0.08, slow: 0.04 } } } },
        key: { name: '绝对零度', icon: '🧊', effect: { branchDmg: 0.15, hpPct: 0.10, armorAdd: 0.06 } }
      }),
      makeBranch({
        id: 'arcane', name: '奥术', color: '#b197fc', angle: Math.PI * 5 / 6,
        skills: ['arcane_missiles', 'blink', 'arcane_explosion', 'arcane_power', 'arcane_torrent'],
        core: { name: '奥术精通', icon: '🔮' },
        vit: { name: '奥能灌注', icon: '❤' },
        power: { name: '法力涌动', icon: '🔺' },
        util: { name: '加速', icon: '⏱', effect: { cdrPct: 0.02 } },
        s1: { name: '奥术飞弹', icon: '✨', effect: { skills: { arcane_missiles: { dmg: 0.08, cd: -0.03 } } } },
        s2: { name: '闪现', icon: '🌌', effect: { skills: { blink: { cd: -0.06, dist: 0.04 } } } },
        s3: { name: '魔爆术', icon: '💠', effect: { skills: { arcane_explosion: { dmg: 0.08, area: 0.04 } } } },
        s4: { name: '奥术强化', icon: '🔮', effect: { skills: { arcane_power: { buff: 0.08, duration: 0.04 } } } },
        s5: { name: '奥术洪流', icon: '⚡', effect: { skills: { arcane_torrent: { dmg: 0.08, cd: -0.03 } } } },
        key: { name: '奥能超载', icon: '💥', effect: { branchDmg: 0.20, branchCdr: 0.12 } }
      })
    ]
  }
};

/* ---------------- 天赋工具 ---------------- */
const Talents = {
  _nodes: Object.create(null),
  _byId: Object.create(null),

  tree(classId) {
    return CONTENT.talentTrees[classId] || null;
  },

  nodes(classId) {
    if (this._nodes[classId]) return this._nodes[classId];
    const tree = this.tree(classId);
    if (!tree) return [];
    const out = [];
    for (let i = 0; i < tree.branches.length; i++) {
      const b = tree.branches[i];
      for (let j = 0; j < b.nodes.length; j++) {
        const n = b.nodes[j];
        out.push(Object.assign({}, n, {
          classId: classId,
          branchId: b.id,
          branchName: b.name,
          branchColor: b.color,
          branchAngle: b.angle,
          branchSkills: b.skills,
          branchIndex: i
        }));
      }
    }
    this._nodes[classId] = out;
    return out;
  },

  node(classId, id) {
    const map = this._byId[classId] || (this._byId[classId] = Object.create(null));
    if (map[id]) return map[id];
    const list = this.nodes(classId);
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        map[id] = list[i];
        return list[i];
      }
    }
    return null;
  },

  branches(classId) {
    const tree = this.tree(classId);
    return tree ? tree.branches : [];
  },

  branch(classId, branchId) {
    const list = this.branches(classId);
    for (let i = 0; i < list.length; i++) if (list[i].id === branchId) return list[i];
    return null;
  },

  maxRanks(classId) {
    const list = this.nodes(classId);
    let n = 0;
    for (let i = 0; i < list.length; i++) n += list[i].cost.length;
    return n;
  },

  branchMaxRanks(branch) {
    let n = 0;
    for (let i = 0; i < branch.nodes.length; i++) n += branch.nodes[i].cost.length;
    return n;
  },

  rank(slot, id) {
    if (!slot || !slot.talents) return 0;
    return slot.talents[id] || 0;
  },

  totalRanks(slot) {
    if (!slot) return 0;
    const list = this.nodes(slot.classId);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const r = this.rank(slot, list[i].id);
      n += Math.min(r, list[i].cost.length);
    }
    return n;
  },

  nextCost(node, rank) {
    if (!node || !node.cost) return 0;
    return rank < node.cost.length ? node.cost[rank] : 0;
  },

  spent(classId, talents) {
    const list = this.nodes(classId);
    let sum = 0;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const r = talents && talents[n.id] ? Math.min(talents[n.id], n.cost.length) : 0;
      for (let k = 0; k < r; k++) sum += n.cost[k];
    }
    return sum;
  },

  canBuy(slot, nodeOrId) {
    if (!slot) return { ok: false, reason: 'noslot' };
    const node = typeof nodeOrId === 'string' ? this.node(slot.classId, nodeOrId) : nodeOrId;
    if (!node) return { ok: false, reason: 'nonode' };

    const rank = this.rank(slot, node.id);
    if (rank >= node.cost.length) return { ok: false, reason: 'max', node: node, rank: rank };

    const missing = [];
    const needRank = node.reqRank || 1;
    for (let i = 0; i < node.req.length; i++) {
      const reqId = node.req[i];
      if (this.rank(slot, reqId) < needRank) missing.push(reqId);
    }
    if (missing.length) {
      return {
        ok: false, reason: 'req', node: node, rank: rank,
        missing: missing, needRank: needRank
      };
    }

    const cost = node.cost[rank];
    if ((slot.gold || 0) < cost) {
      return { ok: false, reason: 'gold', node: node, rank: rank, cost: cost, need: cost - (slot.gold || 0) };
    }
    return { ok: true, node: node, rank: rank, cost: cost };
  },

  buy(slot, nodeOrId) {
    const chk = this.canBuy(slot, nodeOrId);
    if (!chk.ok) return chk;
    slot.gold -= chk.cost;
    slot.talents[chk.node.id] = chk.rank + 1;
    chk.rank += 1;
    return chk;
  },

  respec(slot) {
    if (!slot) return { refund: 0, spent: 0 };
    const total = this.spent(slot.classId, slot.talents);
    const refund = Math.floor(total * 0.8);
    slot.gold = (slot.gold || 0) + refund;
    slot.talents = Object.create(null);
    return { refund: refund, spent: total };
  },

  /* 把槽位里的等级聚合成玩家 / 技能可用的加成 */
  bonuses(classId, talents) {
    const out = {
      hpPct: 0, dmgPct: 0, cdrPct: 0, armorAdd: 0, speedAdd: 0,
      regenAdd: 0, magnetAdd: 0, areaPct: 0, xpPct: 0, goldPct: 0,
      skills: Object.create(null), onKill: null
    };
    const tree = this.tree(classId);
    if (!tree) return out;

    for (let bi = 0; bi < tree.branches.length; bi++) {
      const branch = tree.branches[bi];
      let branchDmg = 0, branchCdr = 0, branchArea = 0;
      const branchSkills = Object.create(null);

      for (let ni = 0; ni < branch.nodes.length; ni++) {
        const node = branch.nodes[ni];
        const rank = talents && talents[node.id] ? Math.min(talents[node.id], node.cost.length) : 0;
        if (rank <= 0) continue;
        const e = node.effect || {};

        if (e.branchDmg) branchDmg += e.branchDmg * rank;
        if (e.branchCdr) branchCdr += e.branchCdr * rank;
        if (e.branchArea) branchArea += e.branchArea * rank;

        if (e.hpPct) out.hpPct += e.hpPct * rank;
        if (e.dmgPct) out.dmgPct += e.dmgPct * rank;
        if (e.cdrPct) out.cdrPct += e.cdrPct * rank;
        if (e.armorAdd) out.armorAdd += e.armorAdd * rank;
        if (e.speedAdd) out.speedAdd += e.speedAdd * rank;
        if (e.regenAdd) out.regenAdd += e.regenAdd * rank;
        if (e.magnetAdd) out.magnetAdd += e.magnetAdd * rank;
        if (e.areaPct) out.areaPct += e.areaPct * rank;
        if (e.xpPct) out.xpPct += e.xpPct * rank;
        if (e.goldPct) out.goldPct += e.goldPct * rank;

        if (e.onKillHaste) {
          out.onKill = {
            mul: 1 + (e.onKillHaste.mul - 1) * rank,
            duration: e.onKillHaste.duration
          };
        }

        if (e.skills) {
          for (const sid in e.skills) {
            const mods = e.skills[sid];
            const dst = branchSkills[sid] || (branchSkills[sid] = Object.create(null));
            for (const key in mods) {
              dst[key] = (dst[key] || 0) + mods[key] * rank;
            }
          }
        }
      }

      for (let si = 0; si < branch.skills.length; si++) {
        const sid = branch.skills[si];
        const own = branchSkills[sid];
        if (!own && !branchDmg && !branchCdr && !branchArea) continue;
        const dst = out.skills[sid] || (out.skills[sid] = Object.create(null));
        if (own) {
          for (const key in own) dst[key] = (dst[key] || 0) + own[key];
        }
        if (branchDmg) dst.dmg = (dst.dmg || 0) + branchDmg;
        if (branchCdr) dst.cd = (dst.cd || 0) - branchCdr;
        if (branchArea) dst.area = (dst.area || 0) + branchArea;
      }
    }

    out.cdrPct = clamp(out.cdrPct, 0, 0.6);
    out.areaPct = clamp(out.areaPct, 0, 1.0);
    return out;
  },

  /* 深渊侵蚀: 天赋点得越多, 敌人被强化一点。
     这里只是「别让满树完全无脑」的轻量补偿 —— 台服实测 2.5%/1% 会把整棵树的收益吃掉一半,
     和「天赋越多越轻松」的目标相反, 所以压到 1.2%/0.5%(满树 +9.6% HP / +4% 伤害)。 */
  erosion(totalRanks) {
    const stacks = Math.min(8, Math.max(0, Math.floor(totalRanks / 10)));
    return {
      stacks: stacks,
      hp: 1 + 0.012 * stacks,
      dmg: 1 + 0.005 * stacks
    };
  },

  /* 天赋节点的美术资源: 技能节点复用技能图标, 其余用新增的 talent/*.png */
  iconAsset(node) {
    if (!node) return null;
    const e = node.effect || {};
    if (node.type === 'skill' && e.skills) {
      const ids = Object.keys(e.skills);
      if (ids.length) return { cat: 'skill', key: ids[0] };
    }
    const suffix = {
      core: 'core', vitality: 'vit', power: 'power',
      utility: 'util', keystone: 'key'
    }[node.type];
    if (!suffix || !node.branchId) return null;
    return { cat: 'talent', key: node.branchId + '_' + suffix };
  },

  /* 生成一组可读的效果文本，给 tooltip 用 */
  effectText(node, rank) {
    if (!node) return '';
    if (!rank || rank <= 0) return '未点亮';
    const parts = [];
    const pct = v => Math.round(v * 100) + '%';
    const e = node.effect || {};

    if (e.branchDmg) parts.push(node.branchName + '系技能伤害 +' + pct(e.branchDmg * rank));
    if (e.branchCdr) parts.push(node.branchName + '系冷却 -' + pct(e.branchCdr * rank));
    if (e.branchArea) parts.push(node.branchName + '系范围 +' + pct(e.branchArea * rank));
    if (e.hpPct) parts.push('最大生命 +' + pct(e.hpPct * rank));
    if (e.dmgPct) parts.push('全部伤害 +' + pct(e.dmgPct * rank));
    if (e.cdrPct) parts.push('冷却 -' + pct(e.cdrPct * rank));
    if (e.armorAdd) parts.push('护甲 +' + pct(e.armorAdd * rank));
    if (e.speedAdd) parts.push('移速 +' + round1(e.speedAdd * rank));
    if (e.regenAdd) parts.push('每秒回复 +' + round1(e.regenAdd * rank));
    if (e.magnetAdd) parts.push('拾取范围 +' + Math.round(e.magnetAdd * rank));
    if (e.areaPct) parts.push('技能范围 +' + pct(e.areaPct * rank));
    if (e.xpPct) parts.push('经验 +' + pct(e.xpPct * rank));
    if (e.goldPct) parts.push('金币 +' + pct(e.goldPct * rank));

    if (e.onKillHaste) {
      const mul = 1 + (e.onKillHaste.mul - 1) * rank;
      parts.push('击杀后 ' + round1(e.onKillHaste.duration) + ' 秒移速 +' + pct(mul - 1));
    }

    if (e.skills) {
      for (const sid in e.skills) {
        const def = CONTENT.skills[sid];
        const name = def ? def.name : sid;
        const m = e.skills[sid];
        if (m.dmg) parts.push(name + '伤害 +' + pct(m.dmg * rank));
        if (m.cd) parts.push(name + '冷却 -' + pct(Math.abs(m.cd) * rank));
        if (m.area) parts.push(name + '范围 +' + pct(m.area * rank));
        if (m.duration) parts.push(name + '持续 +' + pct(m.duration * rank));
        if (m.shield) parts.push(name + '护盾 +' + pct(m.shield * rank));
        if (m.buff) parts.push(name + '增益强度 +' + pct(m.buff * rank));
        if (m.dot) parts.push(name + '持续伤害 +' + pct(m.dot * rank));
        if (m.heal) parts.push(name + '回复 +' + pct(m.heal * rank));
        if (m.knock) parts.push(name + '击退 +' + pct(m.knock * rank));
        if (m.slow) parts.push(name + '减速 +' + pct(m.slow * rank));
        if (m.vuln) parts.push(name + '易伤 +' + pct(m.vuln * rank));
        if (m.dist) parts.push(name + '距离 +' + pct(m.dist * rank));
        if (m.internal) parts.push(name + '内置冷却 -' + pct(Math.abs(m.internal) * rank));
      }
    }

    return parts.length ? parts.join('，') : '效果增强';
  },

  /* 返回某个分支已投入 / 上限，用于外圈进度 */
  branchProgress(slot, branch) {
    let rank = 0;
    for (let i = 0; i < branch.nodes.length; i++) {
      const n = branch.nodes[i];
      rank += Math.min(this.rank(slot, n.id), n.cost.length);
    }
    return { rank: rank, max: this.branchMaxRanks(branch) };
  },

  layout(classId, cx, cy, R) {
    const list = this.nodes(classId);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const a = n.branchAngle + (n.offset || 0) * Math.PI / 180;
      const rr = R * (TALENT_RING_RADII[n.ring - 1] || 0.96);
      out.push({
        node: n,
        x: cx + Math.cos(a) * rr,
        y: cy + Math.sin(a) * rr
      });
    }
    return out;
  },

  saveTalents(slot) {
    if (!slot || !slot.talents) return;
    const list = this.nodes(slot.classId);
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const r = slot.talents[n.id];
      if (r === undefined) continue;
      const v = Math.max(0, Math.min(n.cost.length, Math.floor(Number(r) || 0)));
      if (v > 0) slot.talents[n.id] = v;
      else delete slot.talents[n.id];
    }
  }
};

/* effectText 用到的两位小数 */
function round1(v) {
  return Math.round(v * 10) / 10;
}
