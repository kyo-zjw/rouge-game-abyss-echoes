/* 技能试验场冒烟测试: 用假 DOM 在 Node 里加载 lab.html 的脚本,
   逐个技能施放一遍, 抓运行时报错 / 完全没有特效的技能。
   运行: node test/lab-smoke.js */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['content.js', 'talents.js', 'core.js', 'vfx.js', 'entities.js', 'systems.js', 'ui.js', 'main.js', 'lab.js'];

/* ---------------- 极简 DOM ---------------- */
function makeDom() {
  const canvasEl = {
    tagName: 'canvas',
    width: 1280,
    height: 720,
    style: {},
    getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  };

  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 9 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') {
        return () => ({ addColorStop() {} });
      }
      if (k === 'canvas') return canvasEl;
      return () => {};
    },
    set() { return true; }
  });

  function makeEl(tag) {
    const node = {
      tagName: tag,
      children: [],
      style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); },
        remove(c) { this._s.delete(c); },
        toggle(c) { if (this._s.has(c)) this._s.delete(c); else this._s.add(c); },
        contains(c) { return this._s.has(c); }
      },
      dataset: {},
      textContent: '',
      className: '',
      title: '',
      onclick: null,
      appendChild(c) { this.children.push(c); return c; },
      querySelectorAll() { return []; },
      addEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
      getContext: () => ctx
    };
    // 真实 DOM 里 innerHTML = '' 会清空子节点, 这里照做
    let html = '';
    Object.defineProperty(node, 'innerHTML', {
      get() { return html; },
      set(v) { html = v; if (v === '') node.children.length = 0; }
    });
    return node;
  }

  const registry = new Map();
  const document = {
    getElementById(id) {
      if (id === 'game') return canvasEl;
      if (!registry.has(id)) registry.set(id, makeEl('div'));
      return registry.get(id);
    },
    createElement(tag) { return makeEl(tag); },
    addEventListener() {}
  };

  const store = new Map();
  const sandbox = {
    console, Math, Date, JSON, Set, Map, Proxy,
    Object, Array, Number, String, Boolean, Error,
    isFinite, parseInt, parseFloat,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    document,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    AudioContext: undefined
  };

  // 浏览器里 window 就是全局对象, 这里照做, 脚本里的 window.X / 裸 X 才能互通
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  for (const f of FILES) {
    const code = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    try {
      vm.runInContext(code, context, { filename: f });
    } catch (err) {
      throw new Error('加载 ' + f + ' 失败: ' + err.message + '\n' + err.stack);
    }
  }
  return { context, run: code => vm.runInContext(code, context), document, registry };
}

/* ---------------- 跑一遍所有技能 ---------------- */
const h = makeDom();

const base = h.run(`(function(){
  return {
    ready: !!(window.LAB && window.GAME),
    state: GAME.state,
    skillId: LAB.skillId,
    cards: document.getElementById('lab-skills').children.length,
    enemies: GAME.enemies.length,
    error: null
  };
})()`);

console.log('--- 初始化 ---');
console.log(JSON.stringify(base, null, 2));

const rows = h.run(`(function(){
  const out = [];
  for (const cls of ['warrior', 'mage']) {
    LAB.switchClass(cls);
    for (const id of CONTENT.classes[cls].skills) {
      const row = { cls, id, name: CONTENT.skills[id].name, err: null, dmg: 0, vfx: 0, fx: 0, hit: false };
      try {
        LAB.clearTargets();
        LAB.spawnTargets();
        LAB.equip(id);
        LAB.setLevel(5);
        const d0 = GAME.player.damageDealt;
        let peak = 0;
        for (let i = 0; i < 45; i++) {
          GAME.update(1 / 60);
          peak = Math.max(peak, VFX.items.length);
        }
        row.dmg = Math.round(GAME.player.damageDealt - d0);
        row.vfx = peak;
        row.fx = FX.parts.length;
        row.hit = row.dmg > 0;
      } catch (err) {
        row.err = (err && err.stack) || String(err);
      }
      out.push(row);
    }
  }
  return out;
})()`);

const errors = rows.filter(r => r.err);
const silent = rows.filter(r => !r.err && r.dmg === 0 && r.vfx === 0 && r.fx === 0);

console.log('--- 技能逐项 ---');
for (const r of rows) {
  const status = r.err ? 'ERR ' : (r.hit ? '伤害' : (r.vfx || r.fx ? '特效' : '静默'));
  console.log(
    (r.cls === 'warrior' ? '战' : '法') + ' ' + r.id.padEnd(16) +
    r.name.padEnd(6, '　') + ' ' + status.padEnd(3) +
    ' dmg=' + String(r.dmg).padStart(5) +
    ' vfx=' + String(r.vfx).padStart(3) +
    (r.err ? ' ' + r.err.split('\n')[0] : '')
  );
}

console.log('\n--- 汇总 ---');
console.log('技能总数: ' + rows.length + ' / 运行时异常: ' + errors.length + ' / 无任何反馈: ' + silent.length);

const fails = [];
if (!base.ready) fails.push('lab.js 没有初始化 (window.LAB 缺失)');
if (base.state !== 'playing') fails.push('试验场没有进入 playing 状态: ' + base.state);
if (base.cards !== 15) fails.push('技能卡片数量异常: ' + base.cards);
if (!(base.enemies >= 15)) fails.push('假人木桩没有生成: ' + base.enemies);
for (const e of errors) fails.push(e.id + ' 运行时异常: ' + e.err.split('\n')[0]);

if (fails.length) {
  console.error('\n✗ 失败:');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n✓ 技能试验场冒烟测试通过');
