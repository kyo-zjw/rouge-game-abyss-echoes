# 深渊回响 · Echoes of the Abyss v0.7

一个跑在浏览器里的肉鸽割草小游戏（Vampire Survivors 型）：你只控制移动和空格位移，技能全自动施放，靠升级三选一把 Build 堆起来，在 10 分钟的流程里击杀五阶 Boss 的最后一阶（「终焉之眼」或「末日巨龙」）就算通关。

零依赖、零构建，**双击 `index.html` 就能玩**。

## 快速开始

| 操作 | 说明 |
|---|---|
| `WASD` / 方向键 | 移动（技能全自动） |
| `1` `2` `3` 或鼠标点击 | 升级时三选一；槽位页选择第 1/2/3 个存档 |
| `Tab` | 职业 / 形象 / 天赋页切换 正常 / 硬核 |
| `1` / `2` 或点击职业卡 | 建槽时选择战士 / 法师 |
| `1` / `2` 或点击形象卡 | 建槽时选第 1 / 第 2 种形象并进入天赋树 |
| 鼠标点击天赋节点 | 花费金币升级；悬停查看当前 / 下一级效果 |
| `Enter` | 天赋页开始挑战 |
| `R` | 天赋页：洗点（需二次确认）；死亡/胜利后：同槽重开 |
| `T` | 死亡/胜利后进入当前槽的天赋树 |
| `Esc` | 选择页返回上一级；槽位页返回标题；游戏中暂停 |
| `P` | 暂停 |
| `M` | 静音 |
| `空格` | 游戏中朝鼠标方向冲锋 / 闪现（2 层充能）；标题页进入槽位页；结算页返回槽位页 |

### 一局怎么走

- **0:00** 从槽位进入天赋树，点 `开始挑战`；只有本职业的起始技能；背景从 1~3 号场景随机。
- **小怪**：史莱姆、夜蝠、骸骨兵、咒术师（远程）、石魔；精英每 45 秒左右混入。
- **金币**：小怪 3% 掉 1 金，精英 12% 掉 3 金，Boss 按阶掉 30 / 50 / 80 / 120 / 200 金；死亡不没收金币，结算时自动收编地上剩余金币。
- **2:00 / 4:00 / 6:00 / 8:00 / 10:00** 各刷一阶 Boss。Boss **到点必刷，可以多只同场**，不会因为上一只没死而推迟。
- **击杀第 5 阶 Boss（「终焉之眼」或「末日巨龙」）立即通关**，即使场上还有其它 Boss。
- 约 **10 分钟**一局；死亡或通关后按 `R` 同槽重开，按 `T` 回天赋树花金币。

五阶 Boss 每阶有 **2 种**，出生时各 50% 概率；生命/伤害/速度沿用同阶数值，异族 Boss 额外带一个特色机制：

| 阶 | 时间 | 眼球 Boss | 异族 Boss | 异族机制 |
|---|---|---|---|---|
| 1 | 2:00 | 深渊之眼 | 血牙野猪王（野兽） | 蓄力后直线冲锋 |
| 2 | 4:00 | 裂隙之瞳 | 缝尸憎恶（亡灵） | 在脚下放毒云 |
| 3 | 6:00 | 虚空之眼 | 巫毒妖术师（巨魔） | 插下会放暗影弹的图腾 |
| 4 | 8:00 | 湮灭之瞳 | 熔岩暴君（恶魔） | 三连熔岩火雨 |
| 5 | 10:00 | 终焉之眼 | 末日巨龙（巨龙） | 扇形龙息 |

> 调试时加 `?bossalt=1` 可以强制每阶都出异族 Boss。

## 两个职业

开局在职业选择页二选一，再进入形象选择页挑该职业的 **2 种形象之一**；每个职业有 **15 个专属技能**，其中 **14 个进入升级三选一**，单局最多装备 **5 个**，每个技能 **5 级**。技能全部自动施放，玩家只需要走位。

**空格位移**：两个职业各有一个固定位移技，不占技能槽、不进升级卡池，最多储存 **2 层**，每层约 **6 秒**恢复。按下空格会朝**鼠标方向**释放：战士「冲锋」沿直线加速冲刺，路径上的敌人受伤并被撞开；法师「闪现」瞬间传送到目标点。鼠标没动过时朝当前移动方向释放。位移等级随角色等级自动成长（每 8 级 +1，最高 5 级），天赋节点仍能继续强化伤害、距离和充能速度。

| 职业 | 生命 | 速度 | 护甲 | 伤害 | 冷却 | 起始技能 |
|---|---:|---:|---:|---:|---:|---|
| 战士 | 170 | 168 | 12% | 100% | 100% | 英勇打击（近战扇形） |
| 法师 | 110 | 184 | 0% | 110% | 95% | 火球术（远程爆炸） |

- **战士**：贴脸、护盾、回血、破甲、处决、剑刃风暴；靠近战扇形和自身 AoE 清场；空格「冲锋」用来进场或穿过怪群。
- **法师**：火球、寒冰箭、奥术飞弹、暴风雪、烈焰风暴、冰霜屏障、冰封；靠射程、减速和地面 AoE 风筝；空格「闪现」用来拉开距离或躲弹幕。
- 升级时从 **3 张卡**里选 1 张：新技能 / 技能升级 / 共享被动。技能位满 5 个后不再出现新技能卡。
- **9 个共享被动**：力量、急速、疾行、体魄、再生、磁吸、学识、护甲、扩张。
- 升级会回复 **6% 最大生命**；全部技能与被动满级后，升级改为回复 **30 生命**。

完整的 30 个技能数值、升级文案和行为说明见 [`docs/class-system-design.md`](docs/class-system-design.md)。

## 难度

在天赋树 / 建槽时的职业、形象页按 `Tab` 或点击难度切换。已有槽位的难度会写进该槽位，下次进入沿用；新建槽位沿用当前选择。

| 难度 | 敌人生命 | 敌人伤害 | 刷怪密度 | Boss 生命/伤害 | 定位 |
|---|---:|---:|---:|---:|---|
| 正常 | ×1.00 | ×0.90 | ×0.90 | ×1.00 / ×0.90 | 熟悉 Build、能通关 |
| 硬核 | ×1.20 | ×1.05 | ×0.85 | ×1.15 / ×1.05 | 更少容错，冲记录 |

最佳记录按槽位、按难度分开保存（`abyss.slots.v1`）。旧版 `abyss.best.v3` 会迁移到槽 1 的对应难度，旧 key 保留不删。

## 三槽存档 / 金币 / 天赋树（v0.6）

标题页按 `空格` 进入 **3 个存档槽**。每个槽位在创建时绑定职业与形象，之后只升级该槽的天赋、只累积该槽的金币与记录；三个槽互不串档。

- **金币来源**：小怪 3% 掉 1；精英 12% 掉 3；Boss 一阶 30、二阶 50、三阶 80、四阶 120、五阶 200；通关额外 +100。死亡不清空，结算时自动收编地上没捡的金币。
- **天赋树**：每个职业 **3 个分叉 × 10 个节点 = 30 节点 / 84 级**，圆形六环盘面，三等分对应三系。每分支固定 5 个技能节点（强化该系技能）+ 核心 + 3 个通用小节点 + 1 个终极节点。
- **通用小节点**：生命、伤害/技能强度、护甲、移速、回复、范围等永久属性；永久属性只来自天赋树，不进单局随机池。
- **价格**：核心 50/75/110，技能 65/95/135，通用 50~60 起，终极 700。单分支点满 3175 金，三系全满 9525 金。
- **洗点**：天赋页按 `R` 或点「洗点」，二次确认后清空该槽全部天赋，返还已花费金币的 **80%**。
- **深渊侵蚀**：总天赋等级每 10 级 +1 层（最多 8 层），敌人生命 +2.5%/层、伤害 +1%/层；满级为 +20% 生命 / +8% 伤害，天赋页与槽位卡都会显示。
- **技能上限不变**：天赋只加数值与机制，不把 15 个职业技能加进单局卡池。

数值表、节点 ID 与完整设计见 [`docs/meta-progression-design.md`](docs/meta-progression-design.md)。

## 画面与素材

图片加载失败时仍会自动回退到 Canvas 矢量绘制，不会卡住游戏。`assets/` 已按最终资源路径接好：

```
assets/player/warrior_1.png  warrior_2.png
assets/player/mage_1.png     mage_2.png
assets/background/scene_1.png  scene_2.png  scene_3.png
assets/enemy/{slime,bat,skeleton,shooter,brute,totem}.png
assets/boss/abyss_eye_1.png ... abyss_eye_5.png
assets/boss/{boar_king,stitched_abomination,voodoo_hexer,magma_tyrant,doom_dragon}.png
assets/skill/<技能 id>.png        # 30 个技能图标
assets/talent/<分支>_{core,vit,power,util,key}.png  # 30 个天赋图标
```

- **形象**：每职业 2 张，按 `warrior_1` 男 / `warrior_2` 女、`mage_1` 男 / `mage_2` 女对应；在形象选择页选 1 或 2，进入游戏后使用对应 key。角色 PNG 为 512×512，游戏内自动缩放，并叠加暗色描边和脚下阴影，避免和地面贴图糊在一起。
- **人物动画**：单张静态图也会跑起来——待机呼吸、跑动弹跳/倾斜、出手前摇→突进→收招，冲刺有 PNG 残影，法师施法脚下有旋转法阵、手上有聚能光球，剑刃风暴有环绕刀光。若放入可选攻击姿态或序列帧，出招瞬间会自动交叉淡入（见 [`assets/README.md`](assets/README.md)）。
- **技能演出**：全部由 `js/vfx.js` 程序化绘制。火球是带旋转火舌、火星拖尾和爆炸冲击环的飞行弹；龙息有锯齿火锥、翻滚火舌、龙口核心光、余烬、烟、热浪和地面熔岩焦痕；暴风雪有冰面裂纹、旋转风暴臂、落雪和寒霜环；烈焰风暴先画预警法阵再爆发；陨石从屏幕上方拖着尾焰砸下；近战有扇形残影和重击火花；连锁闪电有分叉和闪频。视觉随机使用独立 `Math.random()`，**不消耗战斗 RNG**，不影响种子复现与平衡。静态展示见 [`shots/vfx_showcase_v0.5.png`](shots/vfx_showcase_v0.5.png)（左法师 / 右战士），也可在浏览器打开 `index.html?showcase=1`（法师）、`...showcase=2`（战士）、`...showcase=3`（龙息木桩）查看冻结的演出场。
- **背景**：每局从 `scene_1` ~ `scene_3` 随机挑一张，按比例铺满世界、超出部分居中裁切；没图时回退到程序化地板网格。当前三张分别对应幽暗城、暴风城、达拉然风格。
- **Boss**：同阶眼球 Boss 与异族 Boss 各 50% 概率；异族 Boss 使用独立 PNG key，不再复用阶数贴图。
- 路径写在 `js/content.js` 的 `CONTENT.assets` 里；把 PNG 放进去刷新即可自动替换，加载失败会静默回退到矢量画法。
- 推荐尺寸、序列帧配置、`file://` 注意事项见 [`assets/README.md`](assets/README.md)。

### 用 Seedream 生成素材

`tools/` 里已经接好火山方舟的 `doubao-seedream-5-0-flash-260915`，任务需要图时直接跑：

```bash
node tools/seedream.mjs doctor                 # 检查 key / 模型 / Python
node tools/seedream.mjs list                   # 83 个资产 id
node tools/seedream.mjs generate --spec enemy_slime --debug
node tools/seedream.mjs batch --only boss_1,boss_2
node tools/seedream.mjs reprocess --preset player --debug   # 只重跑抠图，不花 API 费用
```

- key 推荐放在 `~/.dsh/seedream.json`（`{"apiKey":"ark-..."}`），也可用 `ARK_API_KEY` / `VOLCENGINE_API_KEY` 环境变量或 `.env.local`；脚本会自动兜底使用 DSH 已配置的 `VOLCENGINE_API_KEY`。
- 模型/端点/并发在 `tools/seedream.config.json`；83 条提示词和输出规格在 `tools/seedream.prompts.json`。
- 当前 83 张 PNG 已全部生成并接入：4 个 Q 版角色、3 张主城背景、6 个敌人（含巫毒图腾）、10 个 Boss（5 眼球 + 5 异族）、30 个技能图标、30 个天赋图标。总览见 [`shots/catalog_v0.4.png`](shots/catalog_v0.4.png)，10 个 Boss 单独总览见 [`shots/bosses_v0.4.png`](shots/bosses_v0.4.png)，技能图标见 [`shots/skills_v0.3.png`](shots/skills_v0.3.png)，天赋图标见 [`shots/talents_v0.7.png`](shots/talents_v0.7.png)。
- 完整用法、抠色原理和排错见 [`tools/README.md`](tools/README.md)；agent 侧工作流见 `.dsh/skills/seedream-assets/SKILL.md`。


## 目录结构

```
index.html          入口（按顺序加载 8 个脚本）
js/content.js       内容表：职业 / 30 技能 / 被动 / 敌人 / 五阶 Boss / 波次 / 难度 / 素材路径
js/talents.js       元进度：金币、三系天赋树、节点效果、洗点、侵蚀
js/core.js          工具、种子随机、输入、音效合成、粒子、空间网格、素材加载
js/vfx.js           程序化技能特效：弹体 / 地面区域 / 挥砍 / 爆炸 / 闪电 / 施法演出
js/entities.js      玩家 / 敌人（含 Boss）/ 弹体 / 经验宝石 / 金币 / 地面区域
js/systems.js       技能行为、伤害结算、DoT、刷怪器、升级卡池
js/ui.js            全部绘制：世界、背景、HUD、标题、三槽存档、天赋树、选卡、结算
js/main.js          状态机、主循环、相机、生成器、AI 演示、三槽存档、金币结算
docs/               设计文档
assets/             美术资源接口与规格
tools/              Seedream 素材生成器（CLI + 提示词 + 后处理）
test/               无头测试（Node + 假 canvas）
shots/              截图（v0.5 特效展示已更新，早期截图保留作对比）
```

架构是「数据驱动 + 固定步长」：

- 内容都在 `CONTENT` 里，技能行为在 `SKILL_BEHAVIORS` 里，加内容不用碰主循环。
- 逻辑固定 60Hz（`STEP`），渲染跟随 `requestAnimationFrame`；切标签页回来不会瞬移。
- 战斗随机走 `RNG()`（mulberry32），`?seed=123` 可完整复现战斗随机；背景场景独立随机，检查时用 `?scene=1..3` 固定。

## 怎么加内容

### 加一个技能

1. 在 `js/content.js` 的 `CONTENT.skills` 里加一项，写 5 级数值和升级文案（`autoUp()` 会自动生成 4 条“属性提升”文案）。
2. 在 `js/systems.js` 的 `SKILL_BEHAVIORS` 里选一个模板：`strike` / `projectile` / `pbaoe` / `ground` / `chain` / `buff` / `dash` / `channel` / `onkill`。
3. 填 `behavior`、`shape`、`cls` 等字段；卡池、HUD 图标、升级卡会自动生效。

```js
// content.js
my_skill: {
  name: '秘术飞弹', icon: '✧', color: '#b197fc', cls: 'mage',
  desc: '向最近敌人发射一枚会爆炸的飞弹。',
  behavior: 'projectile', shape: 'orb',
  lvl: [ /* 5 级 */ ],
  up: autoUp([...]),
  sheet: 'my_skill' // 可选：对应 assets/skill/my_skill.png
}
```

### 加敌人 / Boss / 波次

改 `CONTENT.enemies`、`CONTENT.bosses`、`CONTENT.bossAlts`、`CONTENT.waves`；Boss 会自动套用 `Enemy` 的 `ai:'boss'` 弹幕/召唤逻辑。异族 Boss 在 `bossAlts` 里写 `tier` / `key` / `mechanic`，并在 `CONTENT.assets.boss` 加同名贴图 key 即可。

## 调平衡的地方

| 想要的效果 | 改哪里 |
|---|---|
| 整体刷怪压力 | `CONTENT.waves` 的 `interval` / `batch` |
| 怪物成长曲线 | `js/main.js` → `updateWorld()` 里的 `this.diff` |
| 升级快慢 | `js/main.js` → `gainXp()` 里的 `xpNeed` 公式 |
| 技能强度 | `js/content.js` 对应技能的 `lvl` 数组 |
| 职业基础数值 | `CONTENT.classes` |
| Boss 强度 | `CONTENT.bosses` 的 `hp` / `dmg` / 弹幕字段；异族机制在 `CONTENT.bossAlts` |
| 难度倍率 | `CONTENT.difficulties` |

当前平衡由内置 AI 采样（AI 不会主动躲弹幕，但会选 Build、捡宝石、风筝）：

<!-- BALANCE:START -->
`node test/balance.js 8 both normal` / `8 both hardcore`（8 个种子，双职业）：

| 难度 | 职业 | 通关 | 平均用时 | 平均击杀 | 平均等级 |
|---|---|---|---:|---:|---:|
| 正常 | 战士 | 0/8 (0%) | 233s | 696 | 20 |
| 正常 | 法师 | 0/8 (0%) | 415s | 2217 | 30 |
| 正常 | 合计 | **0/16 (0%)** | — | — | — |
| 硬核 | 战士 | 0/8 (0%) | 147s | 361 | 12 |
| 硬核 | 法师 | 0/8 (0%) | 150s | 379 | 13 |
| 硬核 | 合计 | **0/16 (0%)** | — | — | — |

- 上表是 v0.5 的 8 种子样本（`node test/balance.js 8 both normal|hardcore`）。法师有 3 个正常种子在 692–693s 时仍存活但未击杀第 5 阶，被扫描脚本记为 `timeout`，不计入通关；实际游戏会继续。
- v0.6 没有改动直接模式的战斗数值，本表继续作为回归基线；满树 / 侵蚀对比用 `TALENTS=full node test/balance.js 4 both normal`、`EROSION=0 TALENTS=full ...`。
- v0.7 加入空格位移、远程小怪削弱与龙息新演出后，一次 8 种子正常样本为战士 **3/8**、法师 **2/8**；样本波动较大，上表仍作为旧基线保留。
- 内置 AI 不躲弹幕，真人通常更高；战士更吃 Build 与走位，法师更吃风筝距离。
- v0.4 加入异族 Boss 后，AI 样本的波动明显变大；这张表只用于回归对比，不代表真人通关率。
<!-- BALANCE:END -->

> 内置 AI 只用于回归和平衡参考；真人可以通过选卡和走位打出更高上限。

## 调试参数

在 URL 后加参数。`?boss` 和 `?warp` 需要和 `?demo=1` 一起用；`?showcase` / `?vfx=breath` 会自动进入演示。

| 参数 | 作用 |
|---|---|
| `?demo=1` | AI 接管，自动开局（演示/平衡用） |
| `?showcase=1` / `?showcase=2` / `?showcase=3` | 冻结逻辑，进入法师 / 战士 / 龙息特效展示场，适合截图 |
| `?vfx=breath` | 不冻结逻辑，循环施放龙息打木桩，用来看动态手感 |
| `?seed=7` | 固定随机种子 |
| `?class=warrior` / `?class=mage` | 指定职业 |
| `?diff=normal` / `?diff=hardcore` | 指定难度 |
| `?skin=1` / `?skin=2` | 指定形象（1/2，两个职业都生效） |
| `?scene=1..3` | 固定背景场景，方便检查对应 PNG |
| `?boss=1..5` | 开局直接召唤对应阶 Boss（需 `demo=1`） |
| `?bossalt=1` | 强制 Boss 使用异族形态（与 `?boss` / `?warp` 同用） |
| `?bosseye=1` | 强制 Boss 使用眼球形态，方便对比 |
| `?warp=300` | 快进 300 秒（需 `demo=1`） |
| `?nopick=1` | 演示时 AI 升级不自动选卡，停在选卡界面 |
| `?nolevel=1` | 演示时升级不进入选卡，直接自动选第一张 |
| `?give=dragon_breath,fireball` | 开局直接塞入指定技能，快速测试某个技能演出 |
| `?slot=1..3` | 启动时选中对应槽位（配合 `?tree=1` 直接看天赋树） |
| `?talents=full` | 调试：按满天赋计算属性（`demo` 直接模式同样生效） |
| `?gold=999` | 调试：给当前槽位加金币 |
| `?tree=1` | 启动时直接进入当前槽的天赋树 |
| `?erosion=0` | 调试：关闭深渊侵蚀 |

例：`index.html?demo=1&seed=7&warp=358&class=mage&diff=normal` 直接看 6 分钟后的 Boss 战。
龙息手感：`index.html?vfx=breath` 循环动态演示；`index.html?showcase=3` 看冻结构图；`index.html?demo=1&class=mage&give=dragon_breath` 进实战。

## 测试

```bash
node test/unit.js      # 72 项：职业/技能/位移/Boss/异族机制/难度/形象/背景/升级/三槽存档/天赋/金币/侵蚀/素材/性能
node test/smoke.js     # 用真实逻辑跑战士+法师长局，抓运行时报错和 NaN
node test/balance.js   # 多种子统计通关率
node test/balance.js 8 both normal    # 8 个种子，双职业，正常
node test/balance.js 8 both hardcore  # 硬核
```

> 本机没装 Node 时可用 DSH 自带的：
> `C:\Users\i-solver\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`

测试用假 canvas 在 Node 里跑真实游戏逻辑（`test/harness.js`），不需要浏览器。最近一次结果：

- `test/unit.js`：**64/64 通过**（新增三槽独立存档、旧档迁移、坏档降级、天赋购买/前置/满级/洗点、永久属性、金币拾取与结算、Boss 金币、侵蚀、直接模式隔离）。
- 性能：400 敌人逻辑更新约 **4–5 ms/帧**（阈值 < 8 ms）；实际单局上限 `CONTENT.maxEnemies = 320`。
- `test/smoke.js`：见下方「最近冒烟结果」。

<!-- SMOKE:START -->
`node test/smoke.js`：通过，无运行时报错 / NaN / 死循环。

- 战士：255.8s 死亡，Lv21，788 击杀，5 技能，见到 1~2 阶 Boss。
- 法师：665.1s **通关**，Lv47，4225 击杀，5 技能，击杀第 5 阶 Boss。
- 素材接口：两局默认形象分别为 `warrior_1` / `mage_1`，背景场景均在 1~3 范围内；重开流程通过。
<!-- SMOKE:END -->

## 已知边界 / 下一步

- 三槽存档与天赋树已做（v0.6）；v0.7 加了空格位移、远程小怪调整、天赋图标与龙息新演出；还没有商店、成就、每日挑战。
- 美术已全部接入 83 张 PNG：4 个 Q 版角色、3 张主城背景、6 个敌人（含巫毒图腾）、10 个 Q 版 Boss（5 眼球 + 5 异族）、30 个技能图标、30 个天赋图标。
- 人物/怪物目前是「单张 PNG + 程序化动作」；可选攻击姿态或序列帧的接入位已经留好，但还没有批量生成 4 套攻击序列图。
- 技能特效是 Canvas 程序化绘制，没有使用特效序列图；同屏特效有数量上限（190 个）和绘制预算控制。
- 只做了键盘 + 鼠标，没适配触屏/手柄。
- 音效是合成音，没有 BGM。
- 内置 AI 只做简单风筝和 Build 评分，不能代表真人上限；平衡采样默认不读取天赋槽位。

优先级建议：**Boss 分阶段/新词缀 → 商店/成就 → 触屏适配**。

---

版本：`0.7.0`。设计变更记录见 [`docs/meta-progression-design.md`](docs/meta-progression-design.md) 与 [`docs/class-system-design.md`](docs/class-system-design.md)，动画/特效说明见 [`docs/vfx-animation.md`](docs/vfx-animation.md)。
