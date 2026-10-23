# 动画与特效层说明（v0.5）

这一版把「单张贴图 + 圆点特效」升级成了两层演出：

1. **人物动作层**：`js/entities.js` 维护动画状态，`js/ui.js` 套用姿态绘制。
2. **程序化特效层**：`js/vfx.js` 统一管理飞行弹、地面区域、挥砍、爆炸、闪电等效果。

所有效果都是 Canvas 程序化绘制，不新增 PNG 也能完整工作；如果以后要换成序列图，`content.js` 和 `Assets` 已经留好接入口。

---

## 1. 人物动作

### 状态

`Player` 上新增了这些字段：

| 字段 | 作用 |
|---|---|
| `facing` | `1` 朝右 / `-1` 朝左；移动或出招时更新 |
| `moving` | 当前是否在移动，决定跑动/待机节奏 |
| `attack` | 当前出招：`{ kind, id, style, angle, t, dur, power }` |
| `channel` | 持续引导技能（剑刃风暴）：`{ id, style, color, radius }` |
| `stepT` | 脚步间隔，用来生成脚下尘土 |

`Player.triggerAttack(kind, angle, id, opt)` 由技能行为在**成功施放时**调用：

| kind | 用于 | 表现 |
|---|---|---|
| `strike` | 近战扇形 | 后仰蓄力 → 向前突进 → 收招 |
| `cast` | 投射物 / 地面 AOE / 连锁 | 身体前倾、脚下法阵、手心聚能 |
| `slam` | 自身 AOE / 重击 | 起跳后砸下、身体压扁 |
| `buff` | 增益 / 护盾 | 站定、身体拉长、光环上升 |
| `dash` | 空格冲锋 / 闪现 | 拉伸、PNG 残影、尘土；冲锋为持续冲刺，闪现为瞬移 |
| `spin` | 旋风斩 / 剑刃风暴 | 旋转、刀光环绕 |

`Player.animPose()` 把这些状态换算成 `{ bob, rot, sx, sy, lunge, lift }`，渲染层只负责套用，避免逻辑和绘制互相纠缠。

### 绘制

`UI.drawPlayer()` 的顺序：

1. 拖尾 / 冲刺 PNG 残影；
2. 脚下阴影（随起跳收缩）；
3. 暗色描边层 + 人物 PNG（`Assets.draw` 仍然至少画两次，保证受伤闪白不回退矢量）；
4. 可选 `_attack` 攻击姿态/序列帧，按出招进度交叉淡入；
5. `VFX.drawPlayerCast()`：法阵、手心光球、剑刃风暴刀光；
6. 护盾 / 无敌环。

没有 PNG 时，矢量回退也会套用同一套姿态变换。

### 可选序列帧

在 `CONTENT.assets.player` 里给形象加 `_attack` key 即可，详见 [`../assets/README.md`](../assets/README.md)。没有该 key 时自动使用单图 + 程序化动作。

---

## 2. 技能特效

### 技能 → 风格

`js/content.js` 末尾的 `CONTENT.skillFx` 把 30 个技能映射到风格名：

```js
CONTENT.skillFx = {
  fireball: 'fire',
  blizzard: 'ice',
  heroic_strike: 'gold',
  rend: 'blood',
  ...
};
```

风格只影响配色和粒子形态，不改数值。`VFX_PALETTE` 里每种风格有 4 个色阶：高光 / 主色 / 边缘 / 暗部。

### 用到的接口

| 接口 | 用途 |
|---|---|
| `VFX.slash(x,y,angle,r,arc,style,color,opt)` | 近战刀光：拖影扇面 + 月牙刃身 + 残影 + 刃口高光 + 重击火花 |
| `VFX.cone(x,y,angle,r,arc,style,color,opt)` | 冰锥 / 通用锥形喷吐 |
| `VFX.breath(x,y,angle,r,arc,style,color,opt)` | 龙息专用：地面焦痕 + 锯齿火锥 / 火舌 / 余烬 / 烟 / 热浪 / **龙头**，一次 push 两层 |
| `VFX.burst(x,y,r,style,color,opt)` | 爆炸、寒冰新星（额外冰刺）、奥术爆裂、Boss 死亡 |
| `VFX.pulse(x,y,r,style,color,opt)` | 奥爆：能量力场 —— 球体膨胀 + 六边形网格 + 符文环 + 外壳亮环 + 碎片 |
| `VFX.slam(x,y,r,style,color,opt)` | 裂地：地面裂纹（带分叉）+ 碎石 + 冲击环 + 尘土，踩地板 / 重击落点 |
| `VFX.spin(x,y,r,style,color,opt)` | 旋风：地面风环 + 三段螺旋气流 + 环绕刀光 + 内吸碎屑 |
| `VFX.shock(x,y,r,style,color,opt)` | 地面冲击环 |
| `VFX.cast(x,y,r,style,color,opt)` | 施法/预警法阵 |
| `VFX.aura(x,y,r,style,color,opt)` | 增益光柱 |
| `VFX.lightning(x1,y1,x2,y2,style,color,opt)` | 连锁闪电、雷击 |
| `VFX.impact(x,y,style,color,opt)` | 小命中火花 |
| `VFX.dust(x,y,style,color,opt)` | 脚步/冲锋尘土 |
| `VFX.drawProjectile(ctx, pr)` | 飞行弹体（火球、冰箭、奥术飞弹、龙息弹、敌方暗影弹） |
| `VFX.drawZone(ctx, z)` | 地面区域（暴风雪、烈焰风暴、毒云、陨石） |
| `VFX.drawPlayerCast(ctx, p, g)` | 玩家施法/引导的持续演出 |

**打击感**（战士向）：

- **命中定格**：`GAME.freeze(sec)` 让整个世界（含特效）冻结 55~70ms，只留震屏衰减；同一时刻只触发一次，0.45s 冷却，避免连击变成幻灯片。
- **刀光**：`_slash` 不再是单条圆弧 —— 拖影扇面（越靠刃口越亮）→ 月牙刃身（内缘 0.58r、外缘 1.02r、尖端收锋）→ 两层残影 → 尖端闪光 → 重击 9 根火花射线。
- **裂地**：`_crack` 画 9 条带分叉的放射裂纹（暗缝 + 发光边），`_debris` 用解析式抛物线甩出 10~22 块碎石，中心还有一次塌陷渐变。
- **旋风**：2D 里用「横向压扁 + 翻转」模拟原地转身（`animPose` 的 `spin` 分支），配合 `_whirl` 的三段螺旋气流、双圈刀光、由外向内收的碎屑；剑刃风暴的引导演出复用同一套形状语言。
- **音效分层**：`slash`（破空 + 刃啸 + 金属泛音）、`heavy`（低频闷响 + 金属）、`quake`（裂地）、`whirl`（风啸）。

**龙息龙首**（`_dragonHead`）：不是「身后一只写实龙在喷火」，而是火焰本身在锥体前段（约 0.62r 处、头长 ≈ 0.38r）聚成一只 **Q 版龙头** —— 圆脑袋、短吻、两颗大亮眼、三簇向后舔的火舌角、张开的下颚，嘴里再甩出三股短火舌。整个头只用火焰调色板 + `lighter` 叠加绘制，没有实体材质和暗部，因此看起来就是锥体里烧出来的一张脸，而不是贴在火上的贴图；头往前领着整条火舌走，正好落在伤害锥形里。张嘴进度按时间推进（0.05s 开始、0.25s 全开）。

**奥爆力场**（`_pulse`）：开爆白光 → 球体膨胀（边缘亮、中间压暗形成中空）→ 三层反向旋转的六边形网格 → 三道错相冲击环 → 18 个符文刻度 → 16 片旋转玻璃碎片 → 白色外壳亮环。


**龙息分层**（`_breath` / `_breathGround`）：

1. 地面层先画扇形焦土和 11 条熔岩裂纹，持续约 1.05s；
2. 烟层用 `source-over` 在火焰后方散开，避免整团火糊成一片；
3. 锯齿锥体用 30 段带正弦扰动的边界裁剪出翻卷边缘，内部填充 5 段径向渐变；
4. 22 条火舌从龙口向外翻卷，颜色在亮黄/橙/红之间交替；
5. 高亮火芯、前沿火环、3 层热浪弧线；
6. 26 个余烬沿锥体飞出，带短拖尾；
7. 视觉半径是命中半径的 1.38 倍，命中判定仍用原 `range`，避免“看起来烧到却没伤害”。

### 弹体与区域的风格字段

- 玩家技能生成弹体时会写 `art = w.id`、`style = def.fx`。
- 地面区域会写 `art = w.id`（`blizzard` / `flamestrike`），Boss 机制写 `boss_poison` / `boss_meteor`。
- 敌方弹体通过 `spawnEnemyBullet(..., style)` 传入 `hex` / `abyss` / `void` / `dragon`。

### 绘制层

`UI.drawWorld()` 的顺序：

```
背景 → 地面 → 区域(咒文/冰面/毒雾) → VFX(ground: 冲击环/尘土/法阵)
→ 宝石 → 敌人 → 玩家 → 飞行弹 → VFX(over: 挥砍/爆炸/闪电) → 伤害数字
```

这样地面效果压在角色脚下，爆炸和刀光盖在角色上方，伤害数字始终可读。

---

## 3. 性能与边界

- `VFX.items` 上限 **190**，超出时丢弃最老的效果。
- 单个效果内部用固定循环次数（最多约 46 个雪花 / 18 个碎片），不创建大量临时对象。
- 纯视觉随机使用 `Math.random()`，**不消耗 `RNG()`**，所以固定种子下的战斗结果不受特效影响。
- 人物动作每帧只做几次三角函数和变换，不增加实体逻辑复杂度。
- 400 敌人逻辑性能测试仍在阈值内（约 5 ms/帧）。

---

## 4. 怎么加一个新技能特效

1. 在 `CONTENT.skillFx` 里给技能 id 配一个风格（或复用已有风格）。
2. 技能行为 `js/systems.js` 成功施放时调用 `p.triggerAttack(...)` 并生成对应 `VFX.*`。
3. 如果是新弹体/新区域，在 `VFX.drawProjectile` / `VFX.drawZone` 里加一个 `case`。
4. 跑 `node test/unit.js`、`node test/smoke.js`，确认没有运行时错误和性能回退。
