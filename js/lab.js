/* =========================================================
   深渊回响 — 技能试验场 (lab.html 专用)
   把游戏切成"沙盒": 不刷怪 / 不死 / 不升级, 假人木桩常驻,
   可以单独挑一个技能、调等级、放慢时间, 反复看特效与数值。
   ========================================================= */

'use strict';

(function () {
  if (typeof GAME === 'undefined' || typeof CONTENT === 'undefined') return;
  if (typeof document === 'undefined' || !document.getElementById('lab')) return;

  const G = GAME;
  const TAU = Math.PI * 2;

  const BEHAVIOR_LABEL = {
    strike: '近战扇形',
    pbaoe: '自身范围',
    projectile: '投射物',
    ground: '地面区域',
    chain: '连锁',
    buff: '增益护盾',
    dash: '位移',
    channel: '持续引导',
    onkill: '击杀触发'
  };

  const LAB = window.LAB = {
    classId: 'warrior',
    skillId: null,
    level: 5,
    auto: false,
    rotate: false,
    interval: 1.2,
    autoT: 0,
    speed: 1,
    paused: false,
    target: 'ring',
    bossTier: 1,
    immortal: true,
    scene: 0,
    skin: 1,
    lowFx: false,
    dps: 0,
    rotIdx: 0,
    _dmgT: 0,
    _dmgLast: 0,
    _respawnT: 0
  };

  const $ = id => document.getElementById(id);
  const skillsOf = cls => CONTENT.classes[cls].skills;

  /* ---------------- 沙盒初始化 ---------------- */

  function sandbox() {
    const p = G.player;
    if (!p) return;

    p.x = CONTENT.world.w / 2;
    p.y = CONTENT.world.h / 2;
    p.invuln = 1e9;
    p.xpMul = 0;              // 不升级, 避免三选一打断试验
    p.cdMul = p.baseCdMul;

    G.autoplay = false;
    G.nolevel = true;
    G.pendingLevels = 0;
    G.t = 0;
    G.threat = 1;

    // 关掉刷怪与 Boss 时间表
    G.spawner.update = function () {};
    G.spawner.opened = true;
    G.spawner.spawnT = 1e9;
    G.spawner.eliteT = 1e9;
    G.spawner.bossIndex = 999;

    G.cam.x = p.x;
    G.cam.y = p.y;
    G.cam.shake = 0;

    G.enemies.length = 0;
    G.bosses.length = 0;
    G.projectiles.length = 0;
    G.zones.length = 0;
    G.gems.length = 0;
    G.grid.clear();
    FX.reset();
    VFX.reset();
  }

  /* ---------------- 木桩 ---------------- */

  function clearTargets() {
    G.enemies.length = 0;
    G.bosses.length = 0;
    G.projectiles.length = 0;
    G.zones.length = 0;
    G.grid.clear();
    LAB._respawnT = 0;
  }

  function addDummy(type, x, y) {
    const e = G.spawnEnemy(type, x, y, false);
    if (!e) return null;
    e.x = x;
    e.y = y;
    e.speed = 0;
    e.dmg = 0;
    e.xp = 0;
    if (e.ai === 'ranged') e.fireT = 1e9;
    if (e.type === 'totem') e.life = 1e9;
    if (LAB.immortal) e.maxHp = e.hp = 99999;
    return e;
  }

  function spawnTargets() {
    clearTargets();
    const p = G.player;
    if (!p || LAB.target === 'none') return;

    if (LAB.target === 'boss') {
      const b = G.spawnBoss(LAB.bossTier);
      if (b) {
        b.x = p.x + 300;
        b.y = p.y - 40;
        b.speed = 0;
        b.dmg = 0;
        b.xp = 0;
        b.burst = 0;
        b.aimed = 0;
        b.summons = 0;
        b.mechanic = '';
        b.burstT = 1e9;
        b.aimedT = 1e9;
        b.summonT = 1e9;
        b.mechT = 1e9;
        if (LAB.immortal) b.maxHp = b.hp = 999999;
      }
      // Boss 旁边留两只小怪, 让"需要一簇目标"的技能也能触发
      addDummy('slime', p.x + 240, p.y + 60);
      addDummy('slime', p.x + 260, p.y + 10);
      return;
    }

    if (LAB.target === 'single') {
      addDummy('brute', p.x + 110, p.y - 10);
      addDummy('skeleton', p.x + 135, p.y + 45);
      addDummy('slime', p.x + 130, p.y - 55);
      return;
    }

    // 假人环: 外圈 12 只(不同种类) + 内圈 4 只(近战够得着)
    const types = ['slime', 'skeleton', 'bat', 'shooter', 'brute'];
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 + 0.12;
      const d = 168 + (i % 3) * 16;
      addDummy(types[i % types.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    }
    for (let i = 0; i < 4; i++) {
      const a = -0.85 + i * 0.56;
      addDummy('slime', p.x + Math.cos(a) * 112, p.y + Math.sin(a) * 108);
    }
  }

  /* ---------------- 技能 ---------------- */

  function equip(id) {
    const p = G.player;
    if (!p || !CONTENT.skills[id]) return;

    p.channel = null;
    p.skills.length = 0;
    p.addSkill(id);
    const w = p.skill(id);
    if (w) {
      w.lvl = LAB.level;
      w.t = 0.15;
      w.channelT = 0;
      w.channelTick = 0;
      w.lastKill = -999;
    }
    LAB.skillId = id;
    LAB.rotIdx = Math.max(0, skillsOf(LAB.classId).indexOf(id));
    paintSkills();
    paintStats();
    paintDps();
  }

  function setLevel(lv) {
    LAB.level = Math.max(1, Math.min(5, lv));
    const w = G.player && G.player.skill(LAB.skillId);
    if (w) {
      w.lvl = LAB.level;
      w.t = 0;
    }
    paintLevel();
    paintStats();
  }

  function castOnce() {
    if (LAB.paused || !G.player) return;
    const w = G.player.skill(LAB.skillId);
    if (w) w.t = 0;
  }

  function displace() {
    const p = G.player;
    if (!p || !p.displacement) return;
    let target;
    if (Input.mouse && Input.mouse.moved) {
      target = G.screenToWorld(Input.mouse.x, Input.mouse.y);
    } else {
      target = { x: p.x + 260, y: p.y - 20 };
    }
    p.castDisplacement(G, target, { free: true });
  }

  /* ---------------- 画面尺寸: 给右侧面板让位 ---------------- */
  function panelWidth() {
    const panel = $('lab');
    if (!panel || panel.classList.contains('hidden')) return 0;
    return panel.offsetWidth || 0;
  }

  function labResize() {
    if (!G.canvas) return;
    const off = panelWidth();
    const w = Math.max(320, (window.innerWidth || 1280) - off);
    const h = (window.innerHeight || 720);
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    G.view = { w, h, dpr };
    G.canvas.width = Math.floor(w * dpr);
    G.canvas.height = Math.floor(h * dpr);
    if (G.canvas.style) {
      G.canvas.style.width = w + 'px';
      G.canvas.style.height = h + 'px';
    }
    G.zoom = clamp(h / 700, 0.8, 1.6);
  }

  /* ---------------- 主循环钩子 ---------------- */

  function labTick(dt) {
    const p = G.player;
    if (!p) return;

    // 保持不死 + 时间冻结(木桩血量/DPS 才能稳定对比)
    p.invuln = 1e9;
    p.hp = p.maxHp;
    G.t = 0;

    // 与游戏内 P 键暂停保持同步
    if (G.state === 'paused') {
      if (!LAB.paused) { LAB.paused = true; paintPause(); }
    } else if (G.state === 'playing') {
      if (LAB.paused) { LAB.paused = false; paintPause(); }
    }

    // 兜底: 真的被打死/通关了, 直接重开沙盒
    if (G.state === 'dead' || G.state === 'win') {
      resetRun();
      return;
    }

    if (!LAB.paused && LAB.auto) {
      LAB.autoT -= dt;
      if (LAB.autoT <= 0) {
        LAB.autoT = LAB.interval;
        if (LAB.rotate) {
          const list = skillsOf(LAB.classId);
          LAB.rotIdx = (LAB.rotIdx + 1) % list.length;
          equip(list[LAB.rotIdx]);
        }
        castOnce();
      }
    }

    // 可击杀木桩打完自动补一波
    if (LAB.target !== 'none' && !LAB.immortal) {
      if (!G.enemies.length && !G.bosses.length) {
        LAB._respawnT += dt;
        if (LAB._respawnT > 0.9) {
          LAB._respawnT = 0;
          spawnTargets();
        }
      } else {
        LAB._respawnT = 0;
      }
    }

    // 伤害统计: 0.5 秒窗口
    LAB._dmgT += dt;
    if (LAB._dmgT >= 0.5) {
      const now = p.damageDealt;
      LAB.dps = Math.round((now - LAB._dmgLast) / LAB._dmgT);
      LAB._dmgLast = now;
      LAB._dmgT = 0;
      paintDps();
    }
  }

  const baseUpdate = G.update.bind(G);
  G.update = function (dt) {
    baseUpdate(dt * LAB.speed);
    labTick(dt);
  };

  const baseRender = G.render.bind(G);
  G.render = function () {
    baseRender();
    const ctx = G.ctx;
    if (!ctx || !G.player) return;
    const def = CONTENT.skills[LAB.skillId];
    const txt = '技能试验场 · ' + (def ? def.name : '-') + ' Lv' + LAB.level +
      ' · ' + LAB.speed.toFixed(2) + '×' +
      (LAB.paused ? ' · 已暂停' : '') +
      (LAB.auto ? ' · 自动' : '');
    ctx.save();
    ctx.globalAlpha = 0.8;
    UI.label(ctx, txt, G.view.w / 2, G.view.h - 26, 13, '#8ecbff', 600, 'center');
    ctx.restore();
  };

  /* ---------------- 运行控制 ---------------- */

  // 接管尺寸计算: 面板展开时画布只占左侧, 不把画面藏在面板背后
  G.resize = labResize;
  labResize();

  function resetRun() {
    G.start(LAB.classId, 'normal');
    sandbox();
    if (LAB.scene) G.scene = LAB.scene;
    setSkin(LAB.skin);
    equip(LAB.skillId && CONTENT.skills[LAB.skillId] ? LAB.skillId : skillsOf(LAB.classId)[0]);
    spawnTargets();
    LAB.paused = false;
    LAB.autoT = 0;
    LAB._dmgT = 0;
    LAB._dmgLast = 0;
    LAB.dps = 0;
    paintAll();
  }

  function switchClass(id) {
    if (!CONTENT.classes[id]) return;
    LAB.classId = id;
    LAB.skillId = null;
    LAB.rotIdx = 0;
    resetRun();
  }

  function setSkin(n) {
    LAB.skin = n;
    const p = G.player;
    if (!p) return;
    const skins = CONTENT.classes[p.classId].skins;
    p.skin = Math.max(1, Math.min(skins.length, n));
    p.skinKey = skins[p.skin - 1];
    paintSkin();
  }

  function togglePause() {
    LAB.paused = !LAB.paused;
    G.state = LAB.paused ? 'paused' : 'playing';
    paintPause();
  }

  function stepOnce() {
    if (!LAB.paused) {
      LAB.paused = true;
      G.state = 'paused';
      paintPause();
    }
    const st = G.state;
    G.state = 'playing';
    baseUpdate(1 / 60);
    G.state = st;
  }

  /* ---------------- 面板绘制 ---------------- */

  function paintClass() {
    const box = $('lab-class');
    if (!box) return;
    box.innerHTML = '';
    for (const id of ['warrior', 'mage']) {
      const def = CONTENT.classes[id];
      const b = document.createElement('button');
      b.textContent = def.icon + ' ' + def.name;
      if (id === LAB.classId) b.className = 'active';
      b.onclick = () => switchClass(id);
      box.appendChild(b);
    }
  }

  function paintSkills() {
    const grid = $('lab-skills');
    if (!grid) return;
    grid.innerHTML = '';
    const list = skillsOf(LAB.classId);
    $('lab-skill-count').textContent = list.length + ' 个';
    for (const id of list) {
      const def = CONTENT.skills[id];
      const b = document.createElement('button');
      b.className = 'skill' + (id === LAB.skillId ? ' active' : '');
      b.style.setProperty('--c', def.color || '#8ecbff');
      b.title = def.desc || '';
      b.innerHTML = '<span class="ico">' + def.icon + '</span>' +
        '<span class="nm">' + def.name + '</span>' +
        '<span class="tag">' + (BEHAVIOR_LABEL[def.behavior] || def.behavior) + '</span>';
      b.onclick = () => equip(id);
      grid.appendChild(b);
    }
  }

  function paintLevel() {
    const box = $('lab-level');
    if (!box) return;
    box.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.textContent = 'Lv' + i;
      if (i === LAB.level) b.className = 'active';
      b.onclick = () => setLevel(i);
      box.appendChild(b);
    }
  }

  function paintTargets() {
    const box = $('lab-targets');
    if (!box) return;
    for (const b of box.querySelectorAll('button')) {
      b.className = b.dataset.target === LAB.target ? 'active' : '';
    }
    const im = $('lab-immortal');
    if (im) im.className = 'toggle' + (LAB.immortal ? ' active' : '');
  }

  function paintTiers() {
    const box = $('lab-bosstier');
    if (!box) return;
    box.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.className = 'mini' + (i === LAB.bossTier ? ' active' : '');
      b.textContent = i + ' 阶';
      b.onclick = () => {
        LAB.bossTier = i;
        if (LAB.target === 'boss') spawnTargets();
        paintTiers();
      };
      box.appendChild(b);
    }
  }

  function paintScene() {
    const box = $('lab-scene');
    if (!box) return;
    box.innerHTML = '';
    for (let i = 1; i <= (CONTENT.sceneCount || 3); i++) {
      const b = document.createElement('button');
      b.className = 'mini' + (i === LAB.scene ? ' active' : '');
      b.textContent = '场景 ' + i;
      b.onclick = () => {
        LAB.scene = i;
        G.scene = i;
        paintScene();
      };
      box.appendChild(b);
    }
  }

  function paintSkin() {
    const box = $('lab-skin');
    if (!box) return;
    box.innerHTML = '';
    const n = (CONTENT.classes[LAB.classId].skins || []).length || 2;
    for (let i = 1; i <= n; i++) {
      const b = document.createElement('button');
      b.className = 'mini' + (i === LAB.skin ? ' active' : '');
      b.textContent = '形象 ' + i;
      b.onclick = () => setSkin(i);
      box.appendChild(b);
    }
  }

  function paintPause() {
    const b = $('lab-pause');
    if (b) {
      b.textContent = LAB.paused ? '继续' : '暂停';
      b.className = 'toggle' + (LAB.paused ? ' active' : '');
    }
  }

  function paintToggles() {
    const auto = $('lab-auto');
    if (auto) auto.className = 'toggle' + (LAB.auto ? ' active' : '');
    const rot = $('lab-rotate');
    if (rot) rot.className = 'toggle' + (LAB.rotate ? ' active' : '');
    const low = $('lab-lowfx');
    if (low) low.className = 'toggle' + (LAB.lowFx ? ' active' : '');
  }

  function paintStats() {
    const box = $('lab-stats');
    if (!box) return;
    const def = CONTENT.skills[LAB.skillId];
    if (!def || !G.player) { box.innerHTML = ''; return; }
    const s = skillStats(G.player, def, { id: LAB.skillId, lvl: LAB.level });
    const keys = ['cd', 'recharge', 'dmg', 'range', 'radius', 'arc', 'speed', 'count',
      'aoe', 'duration', 'tick', 'dps', 'slow', 'slowT', 'knock', 'shield',
      'healPct', 'internalCd', 'distance', 'dmgMul', 'armor'];
    const parts = [];
    for (const k of keys) {
      if (s[k] === undefined || s[k] === null) continue;
      const v = typeof s[k] === 'number' ? Math.round(s[k] * 100) / 100 : s[k];
      parts.push('<span>' + k + '</span><b>' + v + '</b>');
    }
    if (s.dot) parts.push('<span>dot</span><b>' + s.dot.dps + '/s ×' + s.dot.t + 's</b>');
    if (s.execute) {
      parts.push('<span>execute</span><b>≤' + Math.round(s.execute.threshold * 100) + '% ×' + s.execute.mult + '</b>');
    }
    box.innerHTML = parts.join('');
  }

  function paintDps() {
    const box = $('lab-dps');
    if (!box || !G.player) return;
    box.innerHTML =
      '<span>DPS</span><b class="big">' + LAB.dps + '</b>' +
      '<span>总伤害</span><b>' + Math.round(G.player.damageDealt) + '</b>' +
      '<span>击杀</span><b>' + G.kills + '</b>' +
      '<span>敌人</span><b>' + G.enemies.length + '</b>';
  }

  function paintAll() {
    paintClass();
    paintSkills();
    paintLevel();
    paintTargets();
    paintTiers();
    paintScene();
    paintSkin();
    paintPause();
    paintToggles();
    paintStats();
    paintDps();
  }

  /* ---------------- 面板事件 ---------------- */

  function bindUI() {
    $('lab-once').onclick = castOnce;

    $('lab-auto').onclick = () => {
      LAB.auto = !LAB.auto;
      LAB.autoT = 0;
      paintToggles();
    };

    $('lab-rotate').onclick = () => {
      LAB.rotate = !LAB.rotate;
      if (LAB.rotate) LAB.auto = true;
      LAB.autoT = 0;
      paintToggles();
    };

    const iv = $('lab-interval');
    iv.oninput = () => {
      LAB.interval = Number(iv.value);
      $('lab-interval-v').textContent = LAB.interval.toFixed(1) + 's';
    };

    const sp = $('lab-speed');
    sp.oninput = () => {
      LAB.speed = Number(sp.value);
      $('lab-speed-v').textContent = LAB.speed.toFixed(2) + '×';
    };

    for (const b of $('lab-targets').querySelectorAll('button')) {
      b.onclick = () => {
        LAB.target = b.dataset.target;
        if (LAB.target !== 'none') spawnTargets();
        else clearTargets();
        paintTargets();
      };
    }

    $('lab-immortal').onclick = () => {
      LAB.immortal = !LAB.immortal;
      spawnTargets();
      paintTargets();
    };

    $('lab-displace').onclick = displace;

    $('lab-pause').onclick = togglePause;
    $('lab-step').onclick = stepOnce;

    $('lab-fx').onclick = () => {
      FX.reset();
      VFX.reset();
    };

    $('lab-lowfx').onclick = () => {
      LAB.lowFx = !LAB.lowFx;
      VFX.quality = LAB.lowFx ? 0.5 : 1;
      VFX.maxItems = LAB.lowFx ? 110 : 190;
      paintToggles();
    };

    $('lab-hide').onclick = () => {
      $('lab').classList.toggle('hidden');
      labResize();
    };

    window.addEventListener('keydown', e => {
      if (e.code === 'KeyH') {
        $('lab').classList.toggle('hidden');
        labResize();
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  // 暴露给控制台 / 自动化测试
  LAB.equip = equip;
  LAB.setLevel = setLevel;
  LAB.castOnce = castOnce;
  LAB.spawnTargets = spawnTargets;
  LAB.clearTargets = clearTargets;
  LAB.displace = displace;
  LAB.resetRun = resetRun;
  LAB.switchClass = switchClass;
  LAB.stepOnce = stepOnce;
  LAB.togglePause = togglePause;

  resetRun();
  bindUI();

  console.log('[lab] 技能试验场已就绪: window.LAB 可直接调参数');
})();
