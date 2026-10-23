# 素材说明（v0.7）

游戏在图片缺失时会自动回退到 Canvas 矢量绘制，**没有图片也能正常玩**。
这个目录存放 Seedream 生成的 PNG：文件存在就加载，加载失败会静默回退到矢量画法。

## 用 Seedream 生成

`../tools/seedream.mjs` 已接好火山方舟 `doubao-seedream-5-0-flash-260915`，可以按本文件的路径和规格直接生成：

```bash
node tools/seedream.mjs doctor
node tools/seedream.mjs generate --spec enemy_bat --debug
node tools/seedream.mjs batch --only enemy_bat,enemy_brute,boss_1
node tools/seedream.mjs reprocess --preset player --debug   # 只重跑抠图，不花 API 费用
```

83 个条目的提示词、尺寸、抠色 key 在 `tools/seedream.prompts.json`；key 和模型配置见 `tools/README.md`。生成器会按下面的规格自动裁切/缩放，不需要手工改尺寸。


## 目录结构

```
assets/
  player/
    warrior_1.png
    warrior_2.png
    mage_1.png
    mage_2.png
  background/
    scene_1.png
    scene_2.png
    scene_3.png
  enemy/
    slime.png
    bat.png
    skeleton.png
    shooter.png
    brute.png
    totem.png
  boss/
    abyss_eye_1.png
    abyss_eye_2.png
    abyss_eye_3.png
    abyss_eye_4.png
    abyss_eye_5.png
    boar_king.png
    stitched_abomination.png
    voodoo_hexer.png
    magma_tyrant.png
    doom_dragon.png
  skill/
    heroic_strike.png
    cleave.png
    ...（30 个技能，文件名对应 content.js 里的技能 id）
  talent/
    arms_core.png  arms_vit.png  arms_power.png  arms_util.png  arms_key.png
    ...（6 个分支 × 5 类节点，共 30 个天赋图标）
```

路径和文件名已经全部写进 `js/content.js` 的 `CONTENT.assets`，**加图不需要改代码**，只要文件存在即可。

## 推荐规格

| 类型 | 建议尺寸 | 说明 |
|---|---|---|
| 玩家形象 | 512 × 512 | 每职业 2 张，透明底，朝右，居中；选择页会放大显示，游戏内自动缩放 |
| 背景场景 | 2400 × 1600 | 与世界同尺寸最佳；1~3 号各一张，比例不同时居中裁切 |
| 普通敌人 | 64 × 64 | 透明底，朝右，居中 |
| Boss | 192 × 192 | 透明底，居中 |
| 技能图标 | 128 × 128 | 方形，透明底 |
| 天赋图标 | 128 × 128 | 方形，透明底；命名 `<分支>_<core\|vit\|power\|util\|key>`，技能节点复用技能图标 |

- **玩家形象**：职业选择后进入形象选择页，按 `1` / `2` 或点击对应卡片；两个职业各自独立对应 `warrior_1/2`、`mage_1/2`。当前映射为 `warrior_1` 男 / `warrior_2` 女、`mage_1` 男 / `mage_2` 女。
- **背景场景**：每局从 `scene_1` ~ `scene_3` 随机挑一张；调试时用 `?scene=1|2|3` 固定，方便检查。三张分别对应幽暗城、暴风城、达拉然风格。背景图会铺满 2400×1600 的世界，宽高比不一致时居中裁切，不会被拉伸。
- **Boss**：每阶 2 张，出生时 50% 概率选眼球 Boss 或异族 Boss；异族包括 `boar_king`（野兽）、`stitched_abomination`（亡灵）、`voodoo_hexer`（巨魔）、`magma_tyrant`（恶魔）、`doom_dragon`（巨龙）。`totem.png` 是巨魔 Boss 召唤的巫毒图腾，不是独立 Boss。
- 玩家/敌人建议脚底大致在图片底部中央，游戏以实体中心绘制；玩家会额外叠加暗色描边和脚下阴影。
- 普通敌人和玩家会根据移动方向水平翻转，所以原图朝右即可。
- 技能图标只用在升级卡、HUD 技能槽和临时增益图标上。
- 天赋图标按分支与节点类型映射：核心/生命/力量/功能/终极分别是 `core/vit/power/util/key`；技能节点直接复用对应技能图标。
- Boss 图会按 `e.r * 2.7` 的方框缩放；画得比 192 大也没关系。

## 可选：人物攻击姿态 / 序列帧动画

默认是「单张 PNG + 程序化动作」：`js/ui.js` 会给角色叠加待机呼吸、跑动弹跳、出手前摇/突进/收招，`js/vfx.js` 再叠加挥砍、法阵和残影。即使不换图，动作也已经不是静止贴纸。

如果想要真正的 GIF 式逐帧动作，可以给每个形象额外放一张 **攻击姿态图** 或 **水平序列帧图**，文件名建议 `warrior_1_attack.png`，然后在 `content.js` 的 `player` 组里加一项：

```js
player: {
  warrior_1: { src: 'player/warrior_1.png' },
  warrior_1_attack: {
    src: 'player/warrior_1_attack.png',
    frames: 4,       // 横向 4 帧；单张攻击姿态就写 1 或不写
    frameW: 256,
    frameH: 256,
    fps: 14
  }
}
```

- 出招时渲染层会自动把 `warrior_1` 和 `warrior_1_attack` 交叉淡入；攻击序列帧从 `attack.t = 0` 开始播放，正好覆盖一次出招。
- `warrior_2_attack`、`mage_1_attack`、`mage_2_attack` 同理；没有对应 key 就继续用原图和程序化动作，**不会报错**。
- 序列帧要求每帧等宽、横向排列、背景透明；`frameW × frames` 应等于整图宽度。
- 现有 4 张基础形象也可以改成多帧待机/跑动表，只写 `frames/frameW/frameH/fps` 即可，渲染层会按 `p.walk` 自动播放。

## 可选：技能特效贴图

当前技能特效全部是 Canvas 程序化绘制（`js/vfx.js`），不依赖额外贴图，所以 `assets/` 里没有特效图也不会缺演出。以后如果要换成序列图，可以在 `content.js` 增加 `fx` 资源分组，并在 `VFX.drawProjectile / drawZone` 里优先取图、失败再回退程序化绘制。

## 本地打开时的注意

直接双击 `index.html`（`file://`）时，大多数浏览器允许 `<img>` 加载同目录图片；如果遇到图片不显示：

1. 先确认路径/文件名和 `CONTENT.assets` 完全一致；
2. 用任意静态服务器打开项目（例如 `python -m http.server`），再访问 `http://localhost:8000`；
3. 控制台会有一条 `[assets] 缺少图片, 使用矢量回退` 的警告，说明加载失败但游戏会继续运行。

## 以后扩展

- 技能特效贴图：v0.5 仍是程序化绘制；以后可在技能条目里加 `effect` 字段，在 `Assets` 里扩展 `drawEffect`，再让 `VFX` 优先取图。
- 更多职业/敌人：在 `CONTENT.assets` 对应分组里加 key，并在 `CONTENT.classes/enemies/bosses` 里加同名内容即可。
