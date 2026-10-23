/* 测试夹具: 在 Node 里伪造 DOM/Canvas, 加载整套游戏脚本 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['content.js', 'talents.js', 'core.js', 'vfx.js', 'entities.js', 'systems.js', 'ui.js', 'main.js'];

function createHarness(seed) {
  const gradient = { addColorStop() {} };
  let canvas = null;

  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 9 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') {
        return () => gradient;
      }
      if (k === 'canvas') return canvas;
      return () => {};
    },
    set() { return true; }
  });

  canvas = {
    width: 1280,
    height: 720,
    style: {},
    getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  };

  const store = new Map();
  if (seed && typeof seed === 'object') {
    for (const k in seed) store.set(k, String(seed[k]));
  }

  const sandbox = {
    console,
    Math, Date, JSON, Set, Map,
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
    document: {
      getElementById: () => canvas,
      createElement: () => canvas,
      addEventListener() {}
    },
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 2,
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame: () => 0,
      AudioContext: undefined
    }
  };

  // 让 `window` 成为全局对象本身, 符合浏览器脚本的直觉
  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;
  sandbox.window.localStorage = sandbox.localStorage;

  const context = vm.createContext(sandbox);

  for (const f of FILES) {
    const code = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    try {
      vm.runInContext(code, context, { filename: f });
    } catch (err) {
      throw new Error('加载 ' + f + ' 失败: ' + err.message + '\n' + err.stack);
    }
  }

  return {
    context,
    canvas,
    ctx,
    run: code => vm.runInContext(code, context),
    get game() { return vm.runInContext('GAME', context); },
    get Input() { return vm.runInContext('Input', context); }
  };
}

module.exports = { createHarness };
