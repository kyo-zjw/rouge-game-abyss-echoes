/* =========================================================
   深渊回响 — 主循环 / 游戏状态 / 生成器 v0.2
   ========================================================= */

'use strict';

const STEP = 1 / 60;
const SAVE_KEY = 'abyss.best.v3';
const OLD_SAVE_KEY = 'abyss.best.v1';
const DIFF_KEY = 'abyss.diff.v1';
const SLOT_KEY = 'abyss.slots.v1';
const SLOT_COUNT = 3;

function blankRecord() {
  return { time: 0, kills: 0, level: 0, classId: '' };
}

class Game {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.view = { w: 1280, h: 720, dpr: 1 };
    this.zoom = 1;

    this.state = 'title';
    this.time = 0;
    this.t = 0;
    this.kills = 0;
    this.killThisSecond = 0;
    this.pendingLevels = 0;
    this.offers = [];
    this.levelupT = 0;
    this.announceText = '';
    this.announceT = 0;

    this.selectedClass = 'warrior';
    this.difficulty = 'normal';
    this.skinChoice = { warrior: 1, mage: 1 };
    this.scene = 1;
    this.sceneLock = null;

    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.zones = [];
    this.bosses = [];

    this.grid = new Grid(76);
    this.spawner = new Spawner();
    this.diff = { hp: 1, dmg: 1, speed: 1 };
    this.mods = CONTENT.difficulties.normal;

    this.cam = { x: 0, y: 0, shake: 0 };
    this.best = null;
    this.newRecord = false;

    // 元进度：3 槽本地存档 / 直接模式（测试、演示、平衡）
    this.slots = [null, null, null];
    this.active = -1;
    this.runMode = 'menu';        // menu | direct | slot
    this.directMeta = null;
    this.creatingSlot = null;
    this.erosion = { stacks: 0, hp: 1, dmg: 1 };
    this.erosionOff = false;
    this.runGold = 0;
    this.lastGoldGain = 0;
    this.settled = false;
    this.debugTalents = null;
    this.debugTree = false;
    this.debugSlot = -1;
    this.debugGold = 0;
    this.debugGive = [];

    this.slotDelete = { index: -1, t: 0 };
    this.respecConfirmT = 0;
    this.talentToast = '';
    this.talentToastT = 0;

    this.stars = [];
    for (let i = 0; i < 160; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        s: Math.random() * 2 + 0.6,
        a: Math.random() * 0.6 + 0.15,
        c: Math.random() < 0.2 ? '#8ecbff' : '#ffffff',
        sp: Math.random() * 1.5 + 0.4,
        ph: Math.random() * TAU
      });
    }

    this._acc = 0;
    this._last = 0;
    this._bound = false;
    this.autoplay = false;
    this.nopick = false;
    this.nolevel = false;
    this.showcase = false;
    this.showcaseKind = 0;
    this.vfxDemo = false;
    this.vfxT = 0;
  }

  /* ---------------- 启动 ---------------- */
  boot(canvasId) {
    this.canvas = document.getElementById(canvasId || 'game');
    this.ctx = this.canvas.getContext('2d');
    this.best = this.loadBest();
    this.difficulty = this.loadDifficulty();
    this.loadSlots();

    // 调试/演示参数: ?demo=1 让 AI 接管, ?seed=123 固定随机种子
    const search = (typeof location !== 'undefined' && location.search) ? location.search : '';
    const seedMatch = /[?&]seed=(\d+)/.exec(search);
    if (seedMatch) seedRandom(Number(seedMatch[1]));
    if (/[?&]demo=1/.test(search)) this.autoplay = true;
    if (/[?&]showcase=\d+/.test(search)) this.autoplay = true;
    if (/[?&]vfx=breath/.test(search)) {
      this.autoplay = true;
      this.vfxDemo = true;
    }
    this.nopick = /[?&]nopick=1/.test(search);
    this.nolevel = /[?&]nolevel=1/.test(search);

    const classMatch = /[?&]class=(warrior|mage)/.exec(search);
    if (classMatch) this.selectedClass = classMatch[1];
    const diffMatch = /[?&]diff=(normal|hardcore)/.exec(search);
    if (diffMatch) this.difficulty = diffMatch[1];
    const giveMatch = /[?&]give=([a-z_,]+)/.exec(search);
    if (giveMatch) this.debugGive = giveMatch[1].split(',').filter(id => !!CONTENT.skills[id]);

    // 调试: ?skin=1|2 统一指定形象, ?scene=1|2|3 固定背景场景
    const skinMatch = /[?&]skin=(\d+)/.exec(search);
    if (skinMatch) {
      const skin = clamp(Number(skinMatch[1]) || 1, 1, 2);
      this.skinChoice.warrior = skin;
      this.skinChoice.mage = skin;
    }
    const sceneMatch = /[?&]scene=(\d+)/.exec(search);
    if (sceneMatch) {
      this.sceneLock = clamp(Number(sceneMatch[1]) || 1, 1, CONTENT.sceneCount);
    }
    // 调试: ?bossalt=1 强制每阶都出异族 Boss，?bosseye=1 强制眼球 Boss
    this.forceBossAlt = /[?&]bossalt=1/.test(search);
    this.forceBossEye = /[?&]bosseye=1/.test(search);

    // 元进度调试: ?slot=1|2|3 / ?tree=1 / ?gold=999 / ?talents=full / ?erosion=0
    const slotMatch = /[?&]slot=(\d+)/.exec(search);
    if (slotMatch) this.debugSlot = clamp(Number(slotMatch[1]) || 1, 1, SLOT_COUNT) - 1;
    this.debugTree = /[?&]tree=1/.test(search);
    const goldMatch = /[?&]gold=(\d+)/.exec(search);
    if (goldMatch) this.debugGold = Math.max(0, Number(goldMatch[1]) || 0);
    if (/[?&]talents=full/.test(search)) this.debugTalents = 'full';
    this.erosionOff = /[?&]erosion=0/.test(search);

    Assets.init();
    this.reset();
    this.state = 'title';

    if (!this.autoplay) {
      if (this.debugSlot >= 0 && this.slotAt(this.debugSlot)) this.selectSlot(this.debugSlot);
      const slot = this.activeSlot();
      if (slot && this.debugGold > 0) {
        slot.gold += this.debugGold;
        this.debugGold = 0;
        this.saveSlots();
      }
      if (this.debugTree) this.state = slot ? 'talent' : 'slots';
    }

    this.resize();
    const onResize = () => this.resize();
    if (typeof window !== 'undefined') window.addEventListener('resize', onResize);

    Input.init(this.canvas);

    const wake = () => {
      Sfx.init();
      Sfx.resume();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', wake);
      window.addEventListener('mousedown', wake);
    }
    if (this.canvas.addEventListener) this.canvas.addEventListener('mousedown', wake);

    // 主循环
    this._last = performance.now();
    const frame = now => {
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.25) dt = 0.25;     // 切标签页回来不要瞬间刷屏
      this._acc += dt;

      let guard = 0;
      while (this._acc >= STEP && guard < 4) {
        this.update(STEP);
        this._acc -= STEP;
        guard++;
      }
      if (guard >= 4) this._acc = 0;

      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    if (this.autoplay) {
      this.start(this.selectedClass, this.difficulty);
      // ?boss=3 直接召唤第 3 阶 Boss, 方便调试/截图
      const bossMatch = /[?&]boss=(\d+)/.exec(search);
      if (bossMatch) {
        const tier = clamp(Number(bossMatch[1]) || 1, 1, CONTENT.bosses.length);
        this.spawnBoss(tier);
      }
      // ?warp=300 直接快进 300 秒, 用于截图/调试
      const warpMatch = /[?&]warp=(\d+)/.exec(search);
      if (warpMatch) {
        const frames = Math.min(60 * 630, Number(warpMatch[1]) * 60);
        for (let i = 0; i < frames; i++) this.update(STEP);
        // 快进刚好停在选卡界面的话, 先结算掉, 避免截图截到半透明遮罩
        let guard = 0;
        while (this.state === 'levelup' && !this.nopick && guard++ < 30) this.update(STEP);
      }
      // ?showcase=1|2 静态特效展示场, 用于截图/检查动画演出
      const showMatch = /[?&]showcase=(\d+)/.exec(search);
      if (showMatch) this.setupShowcase(Number(showMatch[1]) || 1);
      else if (this.vfxDemo) this.setupBreathDemo();
    }
    return this;
  }

  /* ---------------- 演示用自动驾驶 ---------------- */
  autopilot() {
    const p = this.player;
    const W = CONTENT.world;
    let vx = 0, vy = 0;

    // 最近的宝石: 不管什么职业, 顺路都要捡经验
    let gem = null, gd = 1e9;
    for (let i = 0; i < this.gems.length; i++) {
      const gm = this.gems[i];
      const d = dist(gm.x, gm.y, p.x, p.y);
      if (d < gd && d < 460) { gd = d; gem = gm; }
    }
    const addGem = (w) => {
      if (!gem) return;
      vx += (gem.x - p.x) / Math.max(gd, 1) * w;
      vy += (gem.y - p.y) / Math.max(gd, 1) * w;
    };

    if (p.classId === 'warrior') {
      // 战士要贴脸: 优先追 Boss, 其次追最近的怪
      let target = null, td = 1e9;
      for (let i = 0; i < this.bosses.length; i++) {
        const b = this.bosses[i];
        if (b.dead) continue;
        const d = dist(b.x, b.y, p.x, p.y);
        if (d < td) { td = d; target = b; }
      }
      if (!target) {
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.dead) continue;
          const d = dist(e.x, e.y, p.x, p.y);
          if (d < td && d < 600) { td = d; target = e; }
        }
      }
      if (target) {
        const d = Math.max(td, 1);
        const k = d > 105 ? 1.25 : -0.55;
        vx += (target.x - p.x) / d * k;
        vy += (target.y - p.y) / d * k;
        if (td > 240) addGem(0.55);
      } else {
        addGem(1.2);
      }
      vx += Math.sin(this.t * 1.3) * 0.12;
      vy += Math.cos(this.t * 1.7) * 0.12;
      const dead1 = 0.18;
      Input.keys = {
        KeyD: vx > dead1, KeyA: vx < -dead1,
        KeyS: vy > dead1, KeyW: vy < -dead1
      };
      return;
    }

    // 法师: 围绕 Boss 保持射程, 同时躲小怪 + 捡宝石
    let boss = null, bd = 1e9;
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (b.dead) continue;
      const d = dist(b.x, b.y, p.x, p.y);
      if (d < bd) { bd = d; boss = b; }
    }
    if (boss) {
      const d = Math.max(bd, 1);
      if (bd > 380) {
        vx += (boss.x - p.x) / d * 1.0;
        vy += (boss.y - p.y) / d * 1.0;
      } else if (bd < 280) {
        vx += (p.x - boss.x) / d * 0.85;
        vy += (p.y - boss.y) / d * 0.85;
      } else {
        const a = angTo(p.x, p.y, boss.x, boss.y) + Math.PI / 2;
        vx += Math.cos(a) * 0.45;
        vy += Math.sin(a) * 0.45;
      }
    }

    const list = [];
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead || e.boss) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < 300) list.push({ e, d });
    }
    list.sort((a, b) => a.d - b.d);
    const n = Math.min(6, list.length);
    for (let i = 0; i < n; i++) {
      const e = list[i].e, d = Math.max(list[i].d, 1);
      const w = (300 - d) / 300;
      vx += (p.x - e.x) / d * w;
      vy += (p.y - e.y) / d * w;
    }

    const nearest = list.length ? list[0].d : 1e9;
    if (list.length && nearest < 160) {
      const e = list[0].e, d = Math.max(nearest, 1);
      vx += (p.x - e.x) / d * 2.2;
      vy += (p.y - e.y) / d * 2.2;
    }
    if (nearest > 170) addGem(0.6);

    vx += (W.w / 2 - p.x) / W.w * 0.35;
    vy += (W.h / 2 - p.y) / W.h * 0.35;
    vx += Math.sin(this.t * 0.7) * 0.14;
    vy += Math.cos(this.t * 0.9) * 0.14;

    if (Math.abs(vx) < 0.12 && Math.abs(vy) < 0.12) {
      vx += Math.sin(this.t * 1.7) * 0.5;
      vy += Math.cos(this.t * 2.1) * 0.5;
    }

    const dead = 0.18;
    Input.keys = {
      KeyD: vx > dead, KeyA: vx < -dead,
      KeyS: vy > dead, KeyW: vy < -dead
    };
  }

  resize() {
    if (!this.canvas) return;
    const w = (typeof window !== 'undefined' ? window.innerWidth : 1280) || 1280;
    const h = (typeof window !== 'undefined' ? window.innerHeight : 720) || 720;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

    this.view = { w, h, dpr };
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    if (this.canvas.style) {
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
    }
    // 视野缩放: 让纵向大约看到 700 个世界单位
    this.zoom = clamp(h / 700, 0.8, 1.6);
  }

  /* ---------------- 记录 / 难度 ---------------- */
  loadBest() {
    const out = { normal: blankRecord(), hardcore: blankRecord() };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const b = JSON.parse(raw);
        if (b && (b.normal || b.hardcore)) {
          if (b.normal) out.normal = Object.assign(blankRecord(), b.normal);
          if (b.hardcore) out.hardcore = Object.assign(blankRecord(), b.hardcore);
          return out;
        }
      }
      const old = localStorage.getItem(OLD_SAVE_KEY);
      if (old) {
        const b = JSON.parse(old);
        if (b && typeof b.time === 'number') {
          out.normal = Object.assign(blankRecord(), b);
          this.saveBest(out);
        }
      }
    } catch (err) { /* ignore */ }
    return out;
  }

  saveBest(best) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(best || this.best)); } catch (err) { /* ignore */ }
  }

  /* ---------------- 三槽存档 ---------------- */
  makeSlot(index, classId, skin) {
    const id = CONTENT.classes[classId] ? classId : 'warrior';
    return {
      id: index,
      classId: id,
      skin: clamp(Number(skin) || 1, 1, 2),
      difficulty: CONTENT.difficulties[this.difficulty] ? this.difficulty : 'normal',
      gold: 0,
      talents: {},
      stats: {
        normal: blankRecord(),
        hardcore: blankRecord()
      },
      totals: { runs: 0, wins: 0, kills: 0, seconds: 0, goldEarned: 0 },
      createdAt: Date.now(),
      lastPlayed: 0
    };
  }

  normalizeSlot(raw, index) {
    if (!raw || !raw.classId || !CONTENT.classes[raw.classId]) return null;
    const s = this.makeSlot(index, raw.classId, raw.skin);
    s.difficulty = CONTENT.difficulties[raw.difficulty] ? raw.difficulty : 'normal';
    s.gold = Math.max(0, Math.floor(Number(raw.gold) || 0));
    s.talents = {};
    if (raw.talents && typeof raw.talents === 'object') {
      for (const id in raw.talents) {
        const r = Math.floor(Number(raw.talents[id]) || 0);
        if (r > 0 && Talents.node(s.classId, id)) s.talents[id] = r;
      }
    }
    Talents.saveTalents(s);
    s.stats.normal = Object.assign(blankRecord(), raw.stats && raw.stats.normal);
    s.stats.hardcore = Object.assign(blankRecord(), raw.stats && raw.stats.hardcore);
    s.stats.normal.classId = s.stats.normal.classId || s.classId;
    s.stats.hardcore.classId = s.stats.hardcore.classId || s.classId;
    s.totals = Object.assign(
      { runs: 0, wins: 0, kills: 0, seconds: 0, goldEarned: 0 },
      raw.totals || {}
    );
    s.createdAt = Number(raw.createdAt) || Date.now();
    s.lastPlayed = Number(raw.lastPlayed) || 0;
    return s;
  }

  migrateSlots() {
    const out = { version: 1, active: -1, slots: [null, null, null] };
    const b = this.best || { normal: blankRecord(), hardcore: blankRecord() };
    const has = (b.normal && b.normal.time > 0) || (b.hardcore && b.hardcore.time > 0);
    if (has) {
      const classId = (b.hardcore && b.hardcore.time > 0 && b.hardcore.classId) ||
        (b.normal && b.normal.classId) || 'warrior';
      const s = this.makeSlot(0, classId, 1);
      s.stats.normal = Object.assign(blankRecord(), b.normal);
      s.stats.hardcore = Object.assign(blankRecord(), b.hardcore);
      s.stats.normal.classId = s.stats.normal.classId || s.classId;
      s.stats.hardcore.classId = s.stats.hardcore.classId || s.classId;
      s.lastPlayed = Date.now();
      out.slots[0] = s;
      out.active = 0;
    }
    this.slots = out.slots;
    this.active = out.active;
    this.saveSlots();
  }

  loadSlots() {
    let data = null;
    try {
      const raw = localStorage.getItem(SLOT_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (err) { data = null; }

    if (data && Array.isArray(data.slots)) {
      const slots = [null, null, null];
      for (let i = 0; i < SLOT_COUNT; i++) slots[i] = this.normalizeSlot(data.slots[i], i);
      let active = Number(data.active);
      if (!isFinite(active) || active < 0 || active >= SLOT_COUNT || !slots[active]) {
        active = -1;
        for (let i = 0; i < SLOT_COUNT; i++) if (slots[i]) { active = i; break; }
      }
      this.slots = slots;
      this.active = active;
      return;
    }
    this.migrateSlots();
  }

  saveSlots() {
    try {
      localStorage.setItem(SLOT_KEY, JSON.stringify({
        version: 1,
        active: this.active,
        slots: this.slots
      }));
    } catch (err) { /* ignore */ }
  }

  slotAt(index) {
    return this.slots[index] || null;
  }

  activeSlot() {
    return this.slotAt(this.active);
  }

  selectSlot(index) {
    const slot = this.slotAt(index);
    if (!slot) return false;
    this.active = index;
    this.difficulty = slot.difficulty || this.difficulty;
    this.selectedClass = slot.classId;
    this.skinChoice[slot.classId] = slot.skin || 1;
    slot.lastPlayed = Date.now();
    this.saveSlots();
    return true;
  }

  createSlot(index, classId, skin) {
    if (index < 0 || index >= SLOT_COUNT || this.slotAt(index) || !CONTENT.classes[classId]) return false;
    const slot = this.makeSlot(index, classId, skin);
    slot.lastPlayed = Date.now();
    this.slots[index] = slot;
    this.active = index;
    this.selectedClass = classId;
    this.skinChoice[classId] = slot.skin;
    this.difficulty = slot.difficulty;
    this.saveSlots();
    return true;
  }

  deleteSlot(index) {
    if (!this.slotAt(index)) return false;
    this.slots[index] = null;
    // 不要置 null：updateSlots 下一帧会读取 slotDelete.t，抛异常会直接卡死主循环，
    // 画面停留在删除前的旧帧，看起来就像“删了还在，要刷新才消失”。
    this.slotDelete = { index: -1, t: 0 };
    if (this.active === index) {
      this.active = -1;
      for (let i = 0; i < SLOT_COUNT; i++) if (this.slots[i]) { this.active = i; break; }
    }
    this.saveSlots();
    return true;
  }

  bestOf(diff) {
    if (this.runMode !== 'direct') {
      const slot = this.activeSlot();
      if (slot && slot.stats) return slot.stats[diff] || blankRecord();
    }
    return (this.best && this.best[diff]) || blankRecord();
  }

  loadDifficulty() {
    try {
      const v = localStorage.getItem(DIFF_KEY);
      if (v === 'normal' || v === 'hardcore') return v;
    } catch (err) { /* ignore */ }
    return 'normal';
  }

  saveDifficulty() {
    try { localStorage.setItem(DIFF_KEY, this.difficulty); } catch (err) { /* ignore */ }
  }

  toggleDifficulty() {
    this.difficulty = this.difficulty === 'normal' ? 'hardcore' : 'normal';
    this.saveDifficulty();
    const slot = this.creatingSlot == null ? this.activeSlot() : null;
    if (slot) {
      slot.difficulty = this.difficulty;
      this.saveSlots();
    }
  }

  /* ---------------- 开局 ---------------- */
  reset() {
    const W = CONTENT.world;
    this.mods = CONTENT.difficulties[this.difficulty] || CONTENT.difficulties.normal;

    const slot = this.runMode === 'slot' ? this.activeSlot() : null;
    let meta = null;
    if (slot) {
      meta = Talents.bonuses(slot.classId, slot.talents);
      this.erosion = this.erosionOff
        ? { stacks: 0, hp: 1, dmg: 1 }
        : Talents.erosion(Talents.totalRanks(slot));
    } else if (this.runMode === 'direct' && this.debugTalents === 'full') {
      const all = {};
      const list = Talents.nodes(this.selectedClass);
      for (let i = 0; i < list.length; i++) all[list[i].id] = list[i].cost.length;
      meta = Talents.bonuses(this.selectedClass, all);
      this.erosion = this.erosionOff ? { stacks: 0, hp: 1, dmg: 1 } : Talents.erosion(84);
    } else {
      this.erosion = { stacks: 0, hp: 1, dmg: 1 };
    }

    const skin = slot ? slot.skin : (this.skinChoice[this.selectedClass] || 1);
    this.player = new Player(W.w / 2, W.h / 2, this.selectedClass, skin, meta);
    this.player.addSkill(CONTENT.classes[this.selectedClass].startSkill);
    for (let i = 0; i < this.debugGive.length; i++) this.player.addSkill(this.debugGive[i]);

    // 每局随机 1~3 号场景; 用 Math.random 避免影响种子化战斗 RNG
    this.scene = this.sceneLock || (1 + Math.floor(Math.random() * (CONTENT.sceneCount || 3)));

    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.gems.length = 0;
    this.zones.length = 0;
    this.bosses.length = 0;

    this.grid.clear();
    this.spawner.reset();
    FX.reset();
    VFX.reset();

    this.t = 0;
    this.kills = 0;
    this.killThisSecond = 0;
    this.pendingLevels = 0;
    this.offers = [];
    this.levelupT = 0;
    this.announceText = '';
    this.announceT = 0;
    this.newRecord = false;
    this.runGold = 0;
    this.lastGoldGain = 0;
    this.settled = false;

    this.diff = { hp: 1, dmg: 1, speed: 1 };
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.cam.shake = 0;
  }

  start(classId, diff, skin) {
    if (classId && CONTENT.classes[classId]) this.selectedClass = classId;
    if (diff && CONTENT.difficulties[diff]) this.difficulty = diff;
    if (skin) this.skinChoice[this.selectedClass] = clamp(Number(skin) || 1, 1, 2);
    this.runMode = 'direct';
    this.saveDifficulty();
    this.reset();
    this.state = 'playing';
    Sfx.init();
    Sfx.resume();
    const cls = CONTENT.classes[this.selectedClass];
    this.announce(cls.name + ' · ' + this.mods.name);
  }

  startSlotRun() {
    const slot = this.activeSlot();
    if (!slot) {
      this.state = 'slots';
      return;
    }
    this.runMode = 'slot';
    this.selectedClass = slot.classId;
    this.difficulty = slot.difficulty || this.difficulty;
    this.skinChoice[slot.classId] = slot.skin || 1;
    slot.lastPlayed = Date.now();
    this.saveSlots();
    this.reset();
    this.state = 'playing';
    Sfx.init();
    Sfx.resume();
    const cls = CONTENT.classes[this.selectedClass];
    this.announce(cls.name + ' · ' + this.mods.name);
  }

  /* ---------------- 静态演出展示场 (?showcase=1|2) ----------------
     用于截图/人工检查动画与特效; 冻结逻辑, 只保留渲染。 */
  setupShowcase(kind) {
    const warrior = kind === 2;
    const dragon = kind === 3;
    this.showcase = true;
    this.showcaseKind = kind;
    if (typeof document !== 'undefined' && document.title !== undefined) {
      document.title = '深渊回响 · 特效展示 ' + (dragon ? '龙息' : (warrior ? '战士' : '法师'));
    }
    this.start(dragon ? 'mage' : (warrior ? 'warrior' : 'mage'), 'normal');
    this.state = 'playing';
    this.time = 12;
    this.announceT = 0;
    this.announceText = '';
    this.levelupT = 0;

    const p = this.player;
    p.x = 1400;
    p.y = 1000;
    p.hp = p.maxHp;
    p.invuln = 999;
    p.walk = 7.4;
    p.idleT = 2.1;
    p.facing = 1;

    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.gems.length = 0;
    this.bosses.length = 0;
    this.grid.clear();
    this.spawner.opened = true;
    this.spawner.spawnT = 999;
    this.spawner.eliteT = 999;

    this.cam.x = p.x;
    this.cam.y = p.y;
    this.cam.shake = 0;

    // 3 号展示场: 只留龙息, 方便单独看火焰层次和手感
    if (dragon) {
      p.skills.length = 0;
      p.addSkill('dragon_breath');
      const w = p.skill('dragon_breath');
      if (w) w.lvl = 5;
      p.facing = 1;
      const spots = [
        { type: 'brute', d: 120, a: -0.10 },
        { type: 'skeleton', d: 175, a: 0.12 },
        { type: 'slime', d: 225, a: -0.16 }
      ];
      for (const s of spots) {
        const e = this.spawnEnemy(s.type, p.x + Math.cos(s.a) * s.d, p.y + Math.sin(s.a) * s.d, false);
        if (!e) continue;
        e.hp = e.maxHp = 99999;
        e.speed = 0;
        e.dmg = 0;
      }
      const it = VFX.breath(p.x, p.y, 0, 250, 1.55, 'dragon', '#ff9f43', {
        life: 2.4, groundLife: 2.4
      });
      it.t = 0.28;
      for (const v of VFX.items) if (v.type === 'breath_ground') v.t = 0.34;
      const core = VFX.aura(p.x + 18, p.y, 34, 'fire', '#ffd166', { life: 2.4 });
      core.t = 0.12;
      return;
    }

    const skillIds = warrior
      ? ['heroic_strike', 'bladestorm', 'thunder_clap', 'battle_shout', 'charge']
      : ['fireball', 'blizzard', 'flamestrike', 'arcane_torrent', 'dragon_breath'];
    p.skills.length = 0;
    for (const id of skillIds) {
      p.addSkill(id);
      const w = p.skill(id);
      if (w) w.lvl = id === 'fireball' || id === 'heroic_strike' || id === 'dragon_breath' ? 5 : 3;
    }

    // 正前方放一个木桩, 让龙息有目标可喷
    if (!warrior) {
      const dummy = this.spawnEnemy('brute', p.x + 142, p.y - 8, false);
      if (dummy) {
        dummy.hp = dummy.maxHp = 99999;
        dummy.speed = 0;
        dummy.dmg = 0;
      }
    }

    // 一圈静止的敌人, 给画面提供比例和打击对象
    const ring = [
      { type: 'slime', a: -2.5, d: 190 },
      { type: 'skeleton', a: -2.0, d: 250 },
      { type: 'bat', a: -1.35, d: 300 },
      { type: 'brute', a: -0.75, d: 280 },
      { type: 'shooter', a: -0.1, d: 330 },
      { type: 'slime', a: 0.55, d: 240 },
      { type: 'skeleton', a: 1.1, d: 300 },
      { type: 'bat', a: 1.7, d: 270 },
      { type: 'brute', a: 2.35, d: 320 },
      { type: 'shooter', a: 2.9, d: 260 }
    ];
    for (let i = 0; i < ring.length; i++) {
      const r = ring[i];
      const e = this.spawnEnemy(r.type, p.x + Math.cos(r.a) * r.d, p.y + Math.sin(r.a) * r.d, i === 3);
      if (!e) continue;
      e.hp = e.maxHp = 9999;
      e.speed = 0;
      e.dmg = 0;
      e.t = i * 0.7;
      e.wob = i * 1.3;
    }

    if (warrior) {
      const b = this.spawnBoss(3);
      if (b) {
        b.x = p.x + 300;
        b.y = p.y - 60;
        b.hp = b.maxHp = 99999;
        b.speed = 0;
        b.dmg = 0;
      }
    }

    const addProj = (style, art, x, y, ang, r, aoe) => {
      const pal = vfxPal(style);
      const pr = new Projectile({
        x, y,
        vx: Math.cos(ang) * 300,
        vy: Math.sin(ang) * 300,
        r, dmg: 100, life: 5, aoe: aoe || 0,
        color: pal[1], art, style,
        type: aoe ? 'fireball' : 'bolt'
      });
      for (let i = 0; i < 6; i++) {
        pr.trail.push({
          x: x - Math.cos(ang) * (i * 7 + 6),
          y: y - Math.sin(ang) * (i * 7 + 6)
        });
      }
      pr.age = 0.22;
      this.projectiles.push(pr);
    };

    if (warrior) {
      p.triggerAttack('strike', 0.12, 'heroic_strike', { style: 'gold' });
      if (p.attack) p.attack.t = p.attack.dur * 0.46;
      p.channel = { id: 'bladestorm', style: 'gold', color: '#ffd166', radius: 96 };

      const slash = VFX.slash(p.x, p.y, 0.12, 150, 1.9, 'gold', '#ffd166', { heavy: true });
      slash.t = slash.life * 0.38;
      const slash2 = VFX.slash(p.x, p.y, -0.25, 130, 1.4, 'blood', '#ff6b8b');
      slash2.t = slash2.life * 0.5;
      const shock = VFX.shock(p.x + 80, p.y + 10, 120, 'gold', '#ffe066', { heavy: true });
      shock.t = shock.life * 0.35;
      const burst = VFX.burst(p.x + 240, p.y - 90, 80, 'gold', '#ffd166', { heavy: true });
      burst.t = burst.life * 0.3;
      const aura = VFX.aura(p.x, p.y, 46, 'holy', '#ffe9a8');
      aura.t = aura.life * 0.45;
      const cone = VFX.cone(p.x - 200, p.y + 45, 0.25, 170, 1.1, 'dragon', '#ff7b5d');
      cone.t = cone.life * 0.3;
      addProj('gold', 'heroic_strike', p.x + 170, p.y - 15, -0.05, 7, 0);
    } else {
      p.triggerAttack('cast', 0.18, 'fireball', { style: 'fire' });
      if (p.attack) p.attack.t = p.attack.dur * 0.28;

      this.zones.push(Object.assign(new Zone({
        x: p.x + 190, y: p.y + 80, r: 150, kind: 'field',
        duration: 6, tick: 0.5, dps: 10, color: '#74c0fc',
        id: 'blizzard', art: 'blizzard', style: 'ice'
      }), { t: 1.55 }));
      this.zones.push(Object.assign(new Zone({
        x: p.x - 150, y: p.y + 95, r: 120, kind: 'burst',
        delay: 0.35, dmg: 10, color: '#ff9f43',
        id: 'flamestrike', art: 'flamestrike', style: 'fire'
      }), { t: 0.24 }));
      this.zones.push(Object.assign(new Zone({
        x: p.x - 110, y: p.y - 150, r: 100, kind: 'field',
        hostile: true, duration: 6, tick: 0.6, dps: 10, color: '#8ce99a',
        id: 'boss_poison', art: 'boss_poison', style: 'poison'
      }), { t: 1.2 }));
      this.zones.push(Object.assign(new Zone({
        x: p.x + 50, y: p.y - 170, r: 90, kind: 'burst',
        hostile: true, delay: 0.85, dmg: 10, color: '#ff8c42',
        id: 'boss_meteor', art: 'boss_meteor', style: 'fire'
      }), { t: 0.55 }));

      addProj('fire', 'fireball', p.x + 180, p.y - 40, 0.08, 8, 68);
      addProj('pyro', 'pyroblast', p.x + 260, p.y + 105, 0.35, 13, 100);
      addProj('ice', 'frostbolt', p.x + 110, p.y + 170, -0.65, 7, 0);
      addProj('arcane', 'arcane_missiles', p.x + 80, p.y - 170, 0.55, 5, 0);
      addProj('dragon', 'dragon_breath', p.x + 250, p.y + 20, 0.18, 8, 0);
      addProj('abyss', '', p.x - 250, p.y - 80, -0.15, 6, 0);
      addProj('void', '', p.x - 220, p.y + 150, -0.5, 6, 0);

      const burst = VFX.burst(p.x + 270, p.y - 110, 86, 'fire', '#ff9f43', { heavy: true });
      burst.t = burst.life * 0.32;
      const iceBurst = VFX.burst(p.x + 120, p.y + 175, 62, 'ice', '#74c0fc');
      iceBurst.t = iceBurst.life * 0.28;
      const cast = VFX.cast(p.x + 190, p.y + 80, 120, 'ice', '#74c0fc');
      cast.t = cast.life * 0.45;
      const lightning = VFX.lightning(p.x, p.y - 20, p.x + 250, p.y - 150, 'thunder', '#a29bfe');
      lightning.t = lightning.life * 0.18;
      const aura = VFX.aura(p.x, p.y, 44, 'arcane', '#b197fc');
      aura.t = aura.life * 0.4;
      const cone = VFX.cone(p.x + 220, p.y + 20, 0.18, 150, 0.8, 'dragon', '#ff7b5d');
      cone.t = cone.life * 0.34;
    }
  }

  /* ?vfx=breath: 不冻结逻辑的龙息循环演示, 用来看动态手感 */
  setupBreathDemo() {
    this.setupShowcase(3);
    this.showcase = false;
    this.showcaseKind = 0;
    this.vfxDemo = true;
    this.autoplay = false;
    this.state = 'playing';
    this.vfxT = 0.4;
    VFX.reset();
    const p = this.player;
    p.iframe = 999;
    p.skills.length = 0;
    p.addSkill('dragon_breath');
    const w = p.skill('dragon_breath');
    if (w) { w.lvl = 5; w.t = 0; }
    this.spawner.opened = true;
    this.spawner.spawnT = 999;
    this.spawner.eliteT = 999;
    this.spawner.bossIndex = 999;
  }

  /* ---------------- 主更新 ---------------- */
  update(dt) {
    this.time += dt;

    // 展示场: 冻结逻辑, 只保留渲染, 方便截图/检查演出
    if (this.showcase) {
      Input.endFrame();
      return;
    }

    // 龙息动态演示: 每 2.3 秒强制转好一次, 让火焰连续可看
    if (this.vfxDemo) {
      this.vfxT -= dt;
      if (this.vfxT <= 0) {
        this.vfxT = 2.3;
        const w = this.player.skill('dragon_breath');
        if (w) w.t = 0;
      }
    }

    if (Input.hit('KeyM')) {
      Sfx.enabled = !Sfx.enabled;
      if (Sfx.enabled) Sfx.init();
    }

    switch (this.state) {
      case 'title':
        if (Input.hit('Space') || Input.hit('Enter') ||
            (Input.mouse.clicked && this.time > 0.3)) {
          this.state = 'slots';
        }
        break;

      case 'slots':
        this.updateSlots(dt);
        break;

      case 'talent':
        this.updateTalent(dt);
        break;

      case 'classselect':
        this.updateClassSelect();
        break;

      case 'skinselect':
        this.updateSkinSelect();
        break;

      case 'playing':
        this.updateWorld(dt);
        break;

      case 'levelup':
        this.updateLevelUp(dt);
        break;

      case 'paused':
        if (Input.hit('KeyP') || Input.hit('Escape')) this.state = 'playing';
        break;

      case 'dead':
      case 'win':
        if (this.autoplay) { this.start(this.selectedClass, this.difficulty); break; }
        if (Input.hit('KeyR')) {
          if (this.runMode === 'slot') this.startSlotRun();
          else this.start(this.selectedClass, this.difficulty);
        } else if (Input.hit('KeyT')) {
          this.state = this.activeSlot() ? 'talent' : 'slots';
        } else if (Input.hit('Space') || Input.hit('Escape')) {
          this.reset();
          this.state = 'slots';
        }
        break;
    }

    Input.endFrame();
  }

  hitRect(r, x, y) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  openSlot(index) {
    if (this.slotAt(index)) {
      this.selectSlot(index);
      this.state = 'talent';
    } else {
      this.creatingSlot = index;
      this.state = 'classselect';
      if (!CONTENT.classes[this.selectedClass]) this.selectedClass = 'warrior';
    }
  }

  finishCreateSlot(skin) {
    if (this.creatingSlot == null) return false;
    const index = this.creatingSlot;
    const ok = this.createSlot(index, this.selectedClass, skin);
    this.creatingSlot = null;
    if (!ok) {
      this.state = 'slots';
      return false;
    }
    this.state = 'talent';
    Sfx.play('level');
    return true;
  }

  updateSlots(dt) {
    if (!this.slotDelete) this.slotDelete = { index: -1, t: 0 };
    if (this.slotDelete.t > 0) {
      this.slotDelete.t -= dt;
      if (this.slotDelete.t <= 0) this.slotDelete.index = -1;
    }

    if (Input.hit('Escape')) { this.state = 'title'; return; }

    if (Input.hit('Digit1') || Input.hit('Numpad1')) { this.openSlot(0); return; }
    if (Input.hit('Digit2') || Input.hit('Numpad2')) { this.openSlot(1); return; }
    if (Input.hit('Digit3') || Input.hit('Numpad3')) { this.openSlot(2); return; }

    if (Input.mouse.clicked) {
      const rects = UI.slotRects(this);
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.del && this.hitRect(r.del, Input.mouse.x, Input.mouse.y)) {
          if (this.slotDelete.index === i && this.slotDelete.t > 0) {
            this.deleteSlot(i);
            this.slotDelete.index = -1;
            this.slotDelete.t = 0;
          } else {
            this.slotDelete.index = i;
            this.slotDelete.t = 2.5;
          }
          return;
        }
        if (this.hitRect(r, Input.mouse.x, Input.mouse.y)) {
          this.openSlot(i);
          return;
        }
      }
    }
  }

  talentMessage(text) {
    this.talentToast = text;
    this.talentToastT = 2.2;
  }

  handleRespec(slot) {
    if (this.respecConfirmT > 0) {
      const res = Talents.respec(slot);
      this.saveSlots();
      this.respecConfirmT = 0;
      this.talentMessage('已洗点，返还 ' + res.refund + ' 金');
      Sfx.play('buy');
    } else {
      this.respecConfirmT = 2.5;
      this.talentMessage('再次点击洗点确认（返还 80%）');
      Sfx.play('pick');
    }
  }

  buyTalent(slot, nodeId) {
    const res = Talents.buy(slot, nodeId);
    if (res.ok) {
      this.saveSlots();
      this.respecConfirmT = 0;
      this.talentMessage(res.node.name + ' 升到 ' + res.rank + ' 级  ·  -' + res.cost + ' 金');
      Sfx.play('buy');
      return res;
    }
    Sfx.play('hurt');
    if (res.reason === 'gold') {
      this.talentMessage('金币不足，还差 ' + res.need + ' 金');
    } else if (res.reason === 'req') {
      const names = res.missing.map(id => {
        const n = Talents.node(slot.classId, id);
        return n ? n.name : id;
      });
      this.talentMessage('需要先点 ' + names.join(' / ') + ' ' + res.needRank + ' 级');
    } else if (res.reason === 'max') {
      this.talentMessage('该节点已满级');
    }
    return res;
  }

  updateTalent(dt) {
    if (this.talentToastT > 0) this.talentToastT -= dt;
    if (this.respecConfirmT > 0) {
      this.respecConfirmT -= dt;
      if (this.respecConfirmT <= 0) this.respecConfirmT = 0;
    }

    const slot = this.activeSlot();
    if (!slot) { this.state = 'slots'; return; }

    if (Input.hit('Escape')) { this.state = 'slots'; return; }
    if (Input.hit('Tab')) { this.toggleDifficulty(); return; }
    if (Input.hit('Enter') || Input.hit('Space')) { this.startSlotRun(); return; }
    if (Input.hit('KeyR')) { this.handleRespec(slot); return; }

    if (Input.mouse.clicked) {
      const b = UI.talentButtons(this);
      if (b) {
        for (let i = 0; i < b.diff.length; i++) {
          const r = b.diff[i];
          if (this.hitRect(r, Input.mouse.x, Input.mouse.y)) {
            if (this.difficulty !== r.id) this.toggleDifficulty();
            return;
          }
        }
        if (this.hitRect(b.start, Input.mouse.x, Input.mouse.y)) { this.startSlotRun(); return; }
        if (this.hitRect(b.respec, Input.mouse.x, Input.mouse.y)) { this.handleRespec(slot); return; }
        if (this.hitRect(b.skin, Input.mouse.x, Input.mouse.y)) {
          slot.skin = slot.skin === 2 ? 1 : 2;
          this.skinChoice[slot.classId] = slot.skin;
          this.saveSlots();
          this.talentMessage('形象已切换');
          Sfx.play('pick');
          return;
        }
        if (this.hitRect(b.back, Input.mouse.x, Input.mouse.y)) { this.state = 'slots'; return; }
      }

      const hit = UI.talentHit(this, Input.mouse.x, Input.mouse.y);
      if (hit) this.buyTalent(slot, hit.node.id);
    }
  }

  chooseClass(classId) {
    if (!CONTENT.classes[classId]) return;
    this.selectedClass = classId;
    this.state = 'skinselect';
  }

  updateClassSelect() {
    if (Input.hit('Tab')) { this.toggleDifficulty(); return; }
    if (Input.hit('Escape')) {
      if (this.creatingSlot != null) {
        this.creatingSlot = null;
        this.state = 'slots';
      } else {
        this.state = 'title';
      }
      return;
    }

    if (Input.hit('Digit1') || Input.hit('Numpad1')) { this.chooseClass('warrior'); return; }
    if (Input.hit('Digit2') || Input.hit('Numpad2')) { this.chooseClass('mage'); return; }

    if (Input.mouse.clicked) {
      const dr = UI.diffRects(this);
      for (let i = 0; i < dr.length; i++) {
        const r = dr[i];
        if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
            Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
          if (this.difficulty !== r.id) this.toggleDifficulty();
          return;
        }
      }
      const rects = UI.classRects(this);
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
            Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
          this.chooseClass(r.id);
          return;
        }
      }
    }
  }

  updateSkinSelect() {
    if (Input.hit('Tab')) { this.toggleDifficulty(); return; }
    if (Input.hit('Escape')) { this.state = 'classselect'; return; }

    if (Input.hit('Digit1') || Input.hit('Numpad1')) {
      if (this.creatingSlot != null) this.finishCreateSlot(1);
      else this.start(this.selectedClass, this.difficulty, 1);
      return;
    }
    if (Input.hit('Digit2') || Input.hit('Numpad2')) {
      if (this.creatingSlot != null) this.finishCreateSlot(2);
      else this.start(this.selectedClass, this.difficulty, 2);
      return;
    }
    if (Input.hit('Space') || Input.hit('Enter')) {
      const skin = this.skinChoice[this.selectedClass] || 1;
      if (this.creatingSlot != null) this.finishCreateSlot(skin);
      else this.start(this.selectedClass, this.difficulty, skin);
      return;
    }

    if (Input.mouse.clicked) {
      const dr = UI.diffRects(this);
      for (let i = 0; i < dr.length; i++) {
        const r = dr[i];
        if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
            Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
          if (this.difficulty !== r.id) this.toggleDifficulty();
          return;
        }
      }
      const rects = UI.skinRects(this);
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
            Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
          if (this.creatingSlot != null) this.finishCreateSlot(r.skin);
          else this.start(this.selectedClass, this.difficulty, r.skin);
          return;
        }
      }
    }
  }

  updateWorld(dt) {
    if (Input.hit('KeyP') || Input.hit('Escape')) {
      this.state = 'paused';
      return;
    }

    this.t += dt;
    this.diff = {
      hp: 1 + this.t / 60 * 0.30,
      dmg: 1 + this.t / 60 * 0.16,
      speed: 1 + this.t / 300 * 0.18
    };

    const p = this.player;
    if (this.autoplay) this.autopilot();
    if (Input.hit('Space')) this.tryDisplacement();
    p.update(dt, this);

    // 敌人网格
    this.grid.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.dead) this.grid.insert(e);
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.dead) e.update(dt, this);
    }
    if (this.state !== 'playing') return;

    separateEnemies(this, dt);

    // 玩家被围住时把敌人往外推一点, 避免完全叠在身上
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead || e.boss) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const rr = e.r + p.r - 3;
      const d2v = dx * dx + dy * dy;
      if (d2v < rr * rr && d2v > 0.01) {
        const d = Math.sqrt(d2v);
        e.x += dx / d * 26 * dt;
        e.y += dy / d * 26 * dt;
      }
    }

    // 技能
    for (let i = 0; i < p.skills.length; i++) {
      const w = p.skills[i];
      const def = CONTENT.skills[w.id];
      const s = skillStats(p, def, w);
      const behavior = SKILL_BEHAVIORS[def.behavior];
      if (behavior) behavior.tick(this, w, s, p, dt);
    }

    updateProjectiles(this, dt);
    if (this.state !== 'playing') return;

    // 地面区域
    for (let i = 0; i < this.zones.length; i++) {
      if (!this.zones[i].dead) this.zones[i].update(dt, this);
    }
    if (this.state !== 'playing') return;

    updateDots(this, dt);
    if (this.state !== 'playing') return;

    for (let i = 0; i < this.gems.length; i++) {
      if (!this.gems[i].dead) this.gems[i].update(dt, this);
    }

    this.spawner.update(this, dt);
    FX.update(dt);
    VFX.update(dt);

    this.cam.shake = Math.max(0, this.cam.shake - 46 * dt);
    this.updateCamera(dt);
    this.cleanup();

    if (this.announceT > 0) this.announceT -= dt;
  }

  screenToWorld(sx, sy) {
    const { w, h } = this.view;
    return {
      x: (sx - w / 2) / this.zoom + this.cam.x,
      y: (sy - h / 2) / this.zoom + this.cam.y
    };
  }

  tryDisplacement() {
    const p = this.player;
    if (!p || !p.displacement) return false;
    let target = null;
    if (Input.mouse.moved) {
      const wp = this.screenToWorld(Input.mouse.x, Input.mouse.y);
      if (dist(wp.x, wp.y, p.x, p.y) > 34) target = wp;
    }
    if (!target) {
      const a = Math.atan2(p.lastMove.y, p.lastMove.x);
      target = { x: p.x + Math.cos(a) * 220, y: p.y + Math.sin(a) * 220 };
    }
    return p.castDisplacement(this, target);
  }

  updateCamera(dt) {
    const p = this.player;
    const k = 1 - Math.pow(0.0008, dt);
    this.cam.x = lerp(this.cam.x, p.x, k);
    this.cam.y = lerp(this.cam.y, p.y, k);

    const halfW = this.view.w / (2 * this.zoom);
    const halfH = this.view.h / (2 * this.zoom);
    const W = CONTENT.world;

    if (W.w <= halfW * 2) this.cam.x = W.w / 2;
    else this.cam.x = clamp(this.cam.x, halfW, W.w - halfW);
    if (W.h <= halfH * 2) this.cam.y = W.h / 2;
    else this.cam.y = clamp(this.cam.y, halfH, W.h - halfH);
  }

  cleanup() {
    const en = this.enemies;
    for (let i = en.length - 1; i >= 0; i--) if (en[i].dead) en.splice(i, 1);

    const pr = this.projectiles;
    for (let i = pr.length - 1; i >= 0; i--) if (pr[i].dead) pr.splice(i, 1);

    const gm = this.gems;
    for (let i = gm.length - 1; i >= 0; i--) if (gm[i].dead) gm.splice(i, 1);

    const zn = this.zones;
    for (let i = zn.length - 1; i >= 0; i--) if (zn[i].dead) zn.splice(i, 1);

    const bs = this.bosses;
    for (let i = bs.length - 1; i >= 0; i--) if (bs[i].dead) bs.splice(i, 1);
  }

  /* ---------------- 升级流程 ---------------- */
  updateLevelUp(dt) {
    this.levelupT += dt;
    if (this.levelupT < 0.16) return;

    if (this.autoplay && !this.nopick) {
      const p = this.player;
      const strongMap = p.classId === 'mage' ? CONTENT.mageStrongAoe : CONTENT.strongAoeSkills;
      let hasDefense = false, hasAoe = false, hasStrongAoe = false;
      for (let i = 0; i < p.skills.length; i++) {
        const id = p.skills[i].id;
        if (CONTENT.defensiveSkills[id]) hasDefense = true;
        if (CONTENT.aoeSkills[id]) hasAoe = true;
        if (strongMap[id]) hasStrongAoe = true;
      }

      let pick = 0, bestScore = -1e9;
      for (let i = 0; i < this.offers.length; i++) {
        const o = this.offers[i];
        let score = 0;
        if (o.kind === 'skill') {
          if (CONTENT.defensiveSkills[o.id] && !hasDefense) score += 100;
          if (strongMap[o.id] && !hasStrongAoe) score += 90;
          else if (CONTENT.aoeSkills[o.id] && !hasAoe) score += 55;
          score += 50;
          if (p.skills.length < 3) score += 20;
          if (p.classId === 'mage' && CONTENT.rangedSkills[o.id]) score += 18;
          if (p.classId === 'mage' && CONTENT.closeRangeSkills[o.id]) score -= 35;
          if (p.skills.length >= CONTENT.maxSkills) score -= 1000;
          if (p.skills.length >= 3 && p.level % 2 !== 0) score -= 8;
        } else if (o.kind === 'up') {
          const w = p.skill(o.id);
          score += 26 + (w ? w.lvl * 6 : 0);
          if (strongMap[o.id]) score += 22;
          if (CONTENT.defensiveSkills[o.id]) score -= 8;
          if (p.classId === 'mage' && CONTENT.rangedSkills[o.id]) score += 18;
          if (p.classId === 'mage' && CONTENT.closeRangeSkills[o.id]) score -= 30 + (w ? w.lvl * 5 : 0);
          if (w && w.lvl === 4) score += 15;
        } else {
          score += 18;
          if (CONTENT.defensivePassives[o.id]) score += 22;
          if (p.passiveLevel(o.id) === 0) score += 8;
          if (p.level % 3 === 0) score += 18;
        }
        if (score > bestScore) { bestScore = score; pick = i; }
      }
      this.choose(pick);
      return;
    }

    if (Input.hit('Digit1') || Input.hit('Numpad1')) { this.choose(0); return; }
    if (Input.hit('Digit2') || Input.hit('Numpad2')) { this.choose(1); return; }
    if (Input.hit('Digit3') || Input.hit('Numpad3')) { this.choose(2); return; }

    if (Input.mouse.clicked) {
      const rects = UI.cardRects(this);
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (Input.mouse.x >= r.x && Input.mouse.x <= r.x + r.w &&
            Input.mouse.y >= r.y && Input.mouse.y <= r.y + r.h) {
          this.choose(i);
          return;
        }
      }
    }
  }

  openLevelUp() {
    const offers = rollOffers(this.player, 3);
    if (!offers.length) {
      // 全部满级, 直接换血
      this.player.heal(30);
      this.pendingLevels = 0;
      return;
    }
    this.offers = offers;
    this.levelupT = 0;
    this.state = 'levelup';
    Sfx.play('level');
  }

  choose(i) {
    const o = this.offers[i];
    if (!o) return;
    applyOffer(this.player, o);
    this.pendingLevels--;
    this.offers = [];

    if (this.pendingLevels > 0) {
      this.openLevelUp();
    } else {
      this.state = 'playing';
      this.player.iframe = Math.max(this.player.iframe, 0.35);
    }
  }

  /* ---------------- 经验 / 掉落 ---------------- */
  gainXp(v) {
    const p = this.player;
    p.xp += v * p.xpMul * (this.mods.xpMul || 1);
    let leveled = false;

    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      p.level++;
      p.xpNeed = Math.round(3 + p.level * 2.6 + Math.pow(p.level, 1.6));
      p.heal(p.maxHp * 0.06);       // 升级回复少量生命, 长局更耐压
      this.pendingLevels++;
      leveled = true;
    }

    if (leveled) {
      FX.ring(p.x, p.y, 58, '#63e6ff', 0.5);
      FX.text(p.x, p.y - 42, 'LEVEL UP', '#63e6ff', 18, 1.0);
      Sfx.play('level');
    }

    if (this.pendingLevels > 0 && this.state === 'playing') {
      // 无人值守演示: 直接秒选, 不弹选卡界面
      if (this.autoplay && this.nolevel) this.autoLevelInstant();
      else this.openLevelUp();
    }
  }

  autoLevelInstant() {
    let guard = 0;
    while (this.pendingLevels > 0 && guard++ < 120) {
      const offers = rollOffers(this.player, 3);
      if (!offers.length) {
        this.player.heal(30);
        this.pendingLevels = 0;
        break;
      }
      applyOffer(this.player, offers[0]);
      this.pendingLevels--;
    }
  }

  dropGem(x, y, value, heal) {
    if (this.gems.length > 320) {
      for (let i = 0; i < this.gems.length; i++) {
        if (!this.gems[i].gold && !this.gems[i].dead) {
          this.gems[i].value += value;
          return;
        }
      }
    }
    this.gems.push(new Gem(x, y, value, heal));
  }

  spawnGemBurst(x, y, total, count) {
    const each = Math.max(1, Math.round(total / count));
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count + rnd(0.4);
      const gemX = clamp(x + Math.cos(a) * rnd(46, 12), 20, CONTENT.world.w - 20);
      const gemY = clamp(y + Math.sin(a) * rnd(46, 12), 20, CONTENT.world.h - 20);
      this.gems.push(new Gem(gemX, gemY, each));
    }
  }

  /* ---------------- 金币 ---------------- */
  bossGold(tier) {
    return CONTENT.gold.boss[tier - 1] || 0;
  }

  dropGold(x, y, value) {
    if (!value || value <= 0) return;
    if (this.gems.length > 320) {
      for (let i = 0; i < this.gems.length; i++) {
        if (this.gems[i].gold && !this.gems[i].dead) {
          this.gems[i].value += value;
          return;
        }
      }
    }
    this.gems.push(new Gem(
      clamp(x + (-12 + Math.random() * 24), 20, CONTENT.world.w - 20),
      clamp(y + (-12 + Math.random() * 24), 20, CONTENT.world.h - 20),
      value, 0, true
    ));
  }

  dropGoldBurst(x, y, total) {
    if (!total || total <= 0) return;
    const count = clamp(Math.round(total / 20), 1, 8);
    let left = total;
    for (let i = 0; i < count; i++) {
      const v = i === count - 1 ? left : Math.max(1, Math.floor(total / count));
      left -= v;
      const a = i * TAU / count + Math.random() * 0.5;
      this.dropGold(
        x + Math.cos(a) * (8 + Math.random() * 26),
        y + Math.sin(a) * (8 + Math.random() * 26),
        v
      );
    }
  }

  collectGold(value) {
    if (!value || value <= 0) return;
    this.runGold += value;
    Sfx.play('coin');
    if (this.player) {
      FX.text(this.player.x, this.player.y - 30, '+' + value + ' 金', '#ffd166', 13, 0.7);
    }
  }

  collectRemainingGold() {
    let rest = 0;
    for (let i = 0; i < this.gems.length; i++) {
      const g = this.gems[i];
      if (g.gold && !g.dead) {
        rest += g.value;
        g.dead = true;
      }
    }
    if (rest > 0) this.runGold += rest;
    return rest;
  }

  awardRunGold(win) {
    const bonus = win ? CONTENT.gold.winBonus : 0;
    const gained = this.runGold + bonus;
    this.lastGoldGain = gained;
    if (this.runMode === 'slot') {
      const slot = this.activeSlot();
      if (slot) {
        slot.gold = Math.max(0, (slot.gold || 0) + gained);
        slot.totals.goldEarned = (slot.totals.goldEarned || 0) + gained;
        slot.totals.runs = (slot.totals.runs || 0) + 1;
        slot.totals.kills = (slot.totals.kills || 0) + this.kills;
        slot.totals.seconds = (slot.totals.seconds || 0) + Math.floor(this.t);
        if (win) slot.totals.wins = (slot.totals.wins || 0) + 1;
        slot.lastPlayed = Date.now();
        this.saveSlots();
      }
    }
    return gained;
  }

  settleRun(win) {
    if (this.settled) return;
    this.settled = true;
    this.collectRemainingGold();
    this.awardRunGold(win);
    this.submitRecord();
  }

  /* ---------------- 生成敌人 ---------------- */
  spawnEnemy(type, x, y, elite, tier) {
    const e = new Enemy(type, x, y, this, elite, tier);
    this.enemies.push(e);
    return e;
  }

  spawnAround(type, elite) {
    const p = this.player;
    const W = CONTENT.world;
    const halfW = this.view.w / (2 * this.zoom);
    const halfH = this.view.h / (2 * this.zoom);

    for (let attempt = 0; attempt < 12; attempt++) {
      const a = rnd(TAU);
      // 贴着视野矩形外沿出生, 别让慢速怪走半天才进场
      const d = Math.max(Math.abs(Math.cos(a)) * halfW, Math.abs(Math.sin(a)) * halfH) + rnd(90, 40);
      const x = clamp(p.x + Math.cos(a) * d, 30, W.w - 30);
      const y = clamp(p.y + Math.sin(a) * d, 30, W.h - 30);

      if (Math.abs(x - p.x) >= halfW * 0.98 || Math.abs(y - p.y) >= halfH * 0.98) {
        return this.spawnEnemy(type, x, y, elite);
      }
    }
    // 兜底: 世界角落
    const x = p.x < W.w / 2 ? W.w - 60 : 60;
    const y = p.y < W.h / 2 ? W.h - 60 : 60;
    return this.spawnEnemy(type, x, y, elite);
  }

  spawnBoss(tier) {
    const p = this.player;
    const W = CONTENT.world;
    const a = rnd(TAU);
    const x = clamp(p.x + Math.cos(a) * 430, 120, W.w - 120);
    const y = clamp(p.y + Math.sin(a) * 430, 120, W.h - 120);
    const e = this.spawnEnemy('boss', x, y, false, tier || 1);
    this.bosses.push(e);
    this.announce(e.name + (e.tag ? ' · ' + e.tag : '') + ' 降临');
    this.cam.shake = 24;
    Sfx.play('boss');
    return e;
  }

  spawnEnemyBullet(x, y, a, speed, dmg, r, color, style) {
    this.projectiles.push(new Projectile({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: r || 6, dmg, life: 5,
      color: color || '#ffa94d',
      hostile: true, type: 'orb', style: style || 'shadow'
    }));
  }

  nearestEnemy(x, y, maxR, exclude) {
    let best = null;
    let bestD = maxR * maxR;
    const list = exclude || null;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      if (list && list.indexOf(e) !== -1) continue;
      const d2v = dist2(x, y, e.x, e.y);
      if (d2v < bestD) { bestD = d2v; best = e; }
    }
    return best;
  }

  /* 技能选目标: Boss 离得足够近才优先, 避免无视脚下的小怪 */
  nearestTarget(x, y, maxR, exclude) {
    let best = null, bestD = maxR * maxR;
    let boss = null, bossD = maxR * maxR;
    const list = exclude || null;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      if (list && list.indexOf(e) !== -1) continue;
      const d2v = dist2(x, y, e.x, e.y);
      if (d2v < bestD) { bestD = d2v; best = e; }
      if (e.boss && d2v < bossD) { bossD = d2v; boss = e; }
    }
    if (!boss) return best;
    if (!best || best === boss) return boss;
    return Math.sqrt(bossD) <= Math.sqrt(bestD) + 80 ? boss : best;
  }

  nearestEnemies(x, y, maxR, count) {
    const arr = [];
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      const d2v = dist2(x, y, e.x, e.y);
      if (d2v <= maxR * maxR) arr.push({ e, d: d2v });
    }
    arr.sort((a, b) => a.d - b.d);
    const out = [];
    for (let i = 0; i < arr.length && i < count; i++) out.push(arr[i].e);
    return out;
  }

  /* ---------------- 事件 ---------------- */
  announce(text) {
    this.announceText = text;
    this.announceT = 2.2;
  }

  record() {
    return {
      time: Math.floor(this.t),
      kills: this.kills,
      level: this.player.level,
      classId: this.selectedClass
    };
  }

  onPlayerDeath() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.cam.shake = 26;
    FX.spark(this.player.x, this.player.y, '#63e6ff', 40, 300, 0.9, 4);
    FX.ring(this.player.x, this.player.y, 90, '#ff6b8b', 0.7);
    Sfx.play('lose');
    this.settleRun(false);
  }

  onBossKilled(e) {
    if (this.state !== 'playing') return;

    if (e.tier >= CONTENT.bosses.length) {
      this.state = 'win';
      this.cam.shake = 30;
      FX.spark(e.x, e.y, e.baseColor, 90, 420, 1.2, 6);
      FX.ring(e.x, e.y, e.r + 40, '#d0bfff', 0.9);
      Sfx.play('win');
      this.settleRun(true);
    } else {
      this.announce(e.name + ' 被击败');
      this.cam.shake = Math.max(this.cam.shake, 8);
    }
  }

  submitRecord() {
    const r = this.record();

    if (this.runMode === 'slot') {
      const slot = this.activeSlot();
      if (!slot) return;
      const b = slot.stats[this.difficulty] || blankRecord();
      if (r.time > b.time || (r.time === b.time && r.kills > b.kills)) {
        slot.stats[this.difficulty] = r;
        this.newRecord = true;
        this.saveSlots();
      }
      return;
    }

    const b = this.bestOf(this.difficulty);
    if (r.time > b.time || (r.time === b.time && r.kills > b.kills)) {
      this.best[this.difficulty] = r;
      this.newRecord = true;
      this.saveBest();
    }
  }

  /* ---------------- 渲染 ---------------- */
  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const { w, h, dpr } = this.view;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this.state === 'title') {
      UI.drawTitle(this);
      return;
    }
    if (this.state === 'slots') {
      UI.drawSlots(this);
      return;
    }
    if (this.state === 'talent') {
      UI.drawTalent(this);
      return;
    }
    if (this.state === 'classselect') {
      UI.drawClassSelect(this);
      return;
    }
    if (this.state === 'skinselect') {
      UI.drawSkinSelect(this);
      return;
    }

    const z = this.zoom;
    const sx = (Math.random() * 2 - 1) * this.cam.shake;
    const sy = (Math.random() * 2 - 1) * this.cam.shake;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x + sx, -this.cam.y + sy);
    UI.drawWorld(this);
    ctx.restore();

    // 暗角
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32,
      w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    UI.drawHUD(this);

    // 展示场标记: 方便截图时确认当前看的是哪套演出
    if (this.showcase) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      UI.label(ctx, '特效展示 · ' + (this.showcaseKind === 3 ? '龙息' : (this.player.classId === 'mage' ? '法师' : '战士')) +
        ' · ?showcase=' + (this.showcaseKind || 1), w / 2, h - 28, 13, '#8ecbff', 600, 'center');
      ctx.restore();
    } else if (this.vfxDemo) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      UI.label(ctx, '龙息动态演示 · ?vfx=breath', w / 2, h - 28, 13, '#ffb347', 600, 'center');
      ctx.restore();
    }

    if (this.state === 'levelup') UI.drawLevelUp(this);
    else if (this.state === 'paused') UI.drawPause(this);
    else if (this.state === 'dead' || this.state === 'win') UI.drawEnd(this);
  }
}

/* 启动 */
const GAME = new Game();

if (typeof window !== 'undefined') window.GAME = GAME;

if (typeof document !== 'undefined' && document.getElementById('game')) {
  GAME.boot('game');
}
