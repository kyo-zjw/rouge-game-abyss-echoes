# Seedream 素材生成器

用火山方舟（Ark）的 **`doubao-seedream-5-0-flash-260915`** 直接在任务里生成 `assets/` 下的 PNG，不需要手工画占位图。

## 快速开始

在仓库根目录执行：

```bash
# 1. 检查 key / 模型 / Python / 待生成数量（不产生费用）
node abyss-echoes/tools/seedream.mjs doctor

# 2. 看所有资产 id 和当前状态
node abyss-echoes/tools/seedream.mjs list

# 2.5 校验 53 条提示词与 js/content.js 的路径是否一一对应
node abyss-echoes/tools/seedream.mjs validate

# 3. 生成单个（--debug 会在旁边多写一张棋盘格预览图）
node abyss-echoes/tools/seedream.mjs generate --spec enemy_slime --debug

# 4. 批量生成指定资产（默认跳过已存在的文件）
node abyss-echoes/tools/seedream.mjs batch --only enemy_slime,enemy_bat,boss_1

# 5. 按类型批量生成
node abyss-echoes/tools/seedream.mjs batch --preset icon

# 6. 只重跑抠图/裁切（用 .cache 里的原图，不花 API 费用）
node abyss-echoes/tools/seedream.mjs reprocess --preset player --debug
```

> Windows 下如果 `node` 不在 PATH，可以用 DSH 自带的：
> `C:\Users\<你>\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`

## API key 和模型设在哪里

脚本按下面的顺序找，**先命中先用**；不会把 key 写进项目，也不会打印 key。

| 配置 | 推荐位置 | 说明 |
|---|---|---|
| API key | `C:\Users\<你>\.dsh\seedream.json` | `{ "apiKey": "ark-..." }`，用户级、仓库外，最安全 |
| API key（备选） | 环境变量 `ARK_API_KEY` 或 `VOLCENGINE_API_KEY` | 适合 CI / 临时终端 |
| API key（备选） | `abyss-echoes/.env.local` | `ARK_API_KEY=ark-...`，已在 `.gitignore` 里 |
| API key（兜底） | DSH 凭证 `~/.dsh/.credentials.yaml` 的 `VOLCENGINE_API_KEY` | 当前 DSH 桌面端已经配好，通常无需再设 |
| 模型 | `abyss-echoes/tools/seedream.config.json` 的 `model` | 默认就是 `doubao-seedream-5-0-flash-260915` |
| 模型（覆盖） | `~/.dsh/seedream.json` 的 `model`，或 `ARK_IMAGE_MODEL`，或 `--model` | 想临时换模型时用 |
| 接口地址 | `seedream.config.json` 的 `baseURL` | 默认 `https://ark.cn-beijing.volces.com/api/v3` |

创建用户级配置（可选）：

```json
{
  "apiKey": "ark-xxxxxxxxxxxxxxxx",
  "model": "doubao-seedream-5-0-flash-260915"
}
```

保存到 `C:\Users\<你>\.dsh\seedream.json` 即可。仓库里有一份占位模板 `tools/seedream.user.example.json`，复制后把 `apiKey` 换掉。

> 注意：DSH 模型设置页 / `cordis.patch.yml` 里的 `doubao-seedream-5-0-flash-260915` 只是把模型登记进 LLM 目录，**不会自动变成“画图工具”**。真正执行画图的是这个脚本 + `seedream-assets` skill；模型 id 的两处默认值保持一致即可。

## 按资产覆盖画风

`seedream.prompts.json` 顶层的 `style` 是默认画风；如果某类资产需要不同画风，在 `styles` 里定义命名风格，再在资产条目里用 `"style": "<名字>"` 引用即可：

```json
{
  "styles": {
    "chibi": "Original cute chibi ... oversized head ... thick outlines ...",
    "cityfloor": "Original high-fantasy MMO capital environment art ..."
  },
  "assets": [
    { "id": "player_warrior_1", "style": "chibi", "prompt": "..." },
    { "id": "bg_scene_1", "style": "cityfloor", "prompt": "..." }
  ]
}
```

- 没写 `style` 的条目继续用顶层 `style`。
- 也可以把 `style` 直接写成完整提示词字符串，脚本会原样使用。
- 当前约定：角色/怪物/Boss 用 `chibi`，主城背景用 `cityfloor`，技能图标用 `icon`。

## 目录与文件

```
abyss-echoes/tools/
  seedream.mjs            # CLI：doctor / list / generate / batch / reprocess
  seedream-post.py        # Pillow 后处理：抠色、裁切、缩放、背景铺满
  seedream.prompts.json   # 83 个资产的外观提示词与输出规格
  seedream.config.json    # 模型、端点、并发、超时（可提交）
  seedream.manifest.json  # 生成记录：提示词/seed/usage/耗时（运行时生成）
  .cache/                 # 原始 2K 图（运行时生成，可删）
```

输出路径全部相对于 `abyss-echoes/`，与 `js/content.js` 的 `CONTENT.assets` 一致。

## 命令参数

通用：

| 参数 | 作用 |
|---|---|
| `--spec <id>` | 用 `seedream.prompts.json` 里的条目生成 |
| `--force` | 覆盖已存在的输出文件 |
| `--debug` | 额外写 `<name>.preview.png`（棋盘格合成，便于看透明边缘） |
| `--dry-run` | 只打印请求 payload，不调用 API、不写文件 |
| `--api-key <key>` | 临时指定 key（不推荐，会进 shell 历史） |
| `--model <id>` / `--size <1K\|2K\|4K>` | 临时覆盖模型 / 尺寸 |
| `--concurrency <n>` | 批量并发，默认 2 |
| `--tol <n>` | `reprocess` 的抠图色差阈值，默认 110 |
| `--include-backgrounds` | `reprocess` 时也重跑背景（默认跳过） |
| `--python <path>` | 指定带 Pillow + numpy 的 Python |

单张自定义（不写进 prompts.json）：

```bash
node abyss-echoes/tools/seedream.mjs generate \
  --prompt "original crystal spider enemy, full body, facing right" \
  --out assets/enemy/crystal_spider.png \
  --preset enemy --target 64 --key-color "#FF00FF"
```

批量筛选：

```bash
node abyss-echoes/tools/seedream.mjs batch --only boss_1,boss_2
node abyss-echoes/tools/seedream.mjs batch --preset background
node abyss-echoes/tools/seedream.mjs batch --limit 5
```

## 生成与后处理流程

1. 拼接全局风格 + 单条提示词，POST `/images/generations`。
2. 请求固定 `response_format: "url"`、`output_format: "png"`、`watermark: false`；下载 URL 立即落盘（URL 24 小时过期）。
3. 精灵/图标：先把图缩到 ≤640 px，从四边采样背景色，用“边界种子 + 局部色差限制 + 色相守卫”的洪水填充抠掉背景；色相守卫只允许真正偏绿/偏品红的背景像素入队，避免吃掉白袍、棕甲和青色高光；绿色 key 还会额外清掉封闭的绿色残边；只对边缘 2 px 做去色溢；裁到 alpha 包围盒，留 10% 边距，补成正方形；用预乘 alpha 做 LANCZOS 缩放，避免透明边发黑。
4. 背景：`ImageOps.fit` 居中 cover 裁到 2400×1600，不拉伸。
5. 写 `seedream.manifest.json`（提示词、seed、usage、耗时、字节数），方便复现。

批量生成时单张失败不会中断其余条目；结尾会汇总失败 id 并以非 0 退出，修好提示词后用 `--only <失败 id>` 补跑即可。

抠色不是“只认 #00FF00”：会优先相信实际边框颜色，所以模型把纯绿画成暗绿渐变也能处理。绿色主体（软泥、冰霜/青色图标）用品红 `#FF00FF` 作为 key，避免把主体一起抠掉。

### 只重跑后处理（不花 API 费用）

调整抠图阈值后，不需要重新请求模型。`tools/.cache/` 里保存了每次生成的原始 2K/1K 图：

```bash
# 重跑全部精灵与图标（默认跳过背景）
node abyss-echoes/tools/seedream.mjs reprocess --debug

# 只重跑某几类，或某几个 id
node abyss-echoes/tools/seedream.mjs reprocess --preset player --debug
node abyss-echoes/tools/seedream.mjs reprocess --only player_mage_2,boss_5

# 临时放宽/收紧色差阈值（默认 110）
node abyss-echoes/tools/seedream.mjs reprocess --preset boss --tol 96
```

`reprocess` 会直接覆盖 `assets/` 下的成品；改阈值前建议先备份 `assets/` 或只加 `--dry-run` 看路径。背景默认不重跑，需要时加 `--include-backgrounds`。

## 常见问题

| 现象 | 处理 |
|---|---|
| `OutputImageSensitiveContentDetected.PolicyViolation` | 提示词里出现知名 IP/角色特征。改成原创描述，避免“slime”“史莱姆”等易触发词 |
| `chroma key found almost no background` | 背景不是纯色或主体贴边。换 `keyColor`，或在提示词里强调 “completely flat uniform chroma-key ... background, no gradient, no shadow” |
| `chroma key removed the whole image` | key 颜色和主体太接近。绿色主体用品红，反之亦然 |
| `No Python with Pillow + numpy found` | 设置 `SEEDREAM_PYTHON`，或在 `seedream.config.json` 的 `python` 写绝对路径；DSH 自带 Python 一般可用 |
| 401 / 403 | key 无效或没开通该模型；先跑 `doctor` 看 key 来源 |
| 429 / 5xx | 脚本会按 `retries` 自动重试；批量时把 `--concurrency` 降到 1 |

## 费用与时间

- 一次请求返回 1 张图。1K 约 4K output tokens，2K 约 16K output tokens，按方舟当时的单价计费。
- 实测：1K 单张约 20–25 s，2K 约 35–50 s；并发 2 时总时间约为串行的一半。
- 全部 83 张建议先按 `--only` 生成当前需要的，确认风格后再补全。

## 给后续任务加新素材

1. 在 `seedream.prompts.json` 的 `assets` 里加一条，填 `id`、`out`、`preset`、`target`/`width+height`、`size`、`keyColor`、`prompt`。
2. 在 `js/content.js` 的 `CONTENT.assets` 对应分组里加同名 key（如果游戏要加载它）。
3. `node tools/seedream.mjs generate --spec <id> --debug`，看预览后再批量。
