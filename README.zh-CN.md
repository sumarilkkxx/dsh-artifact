# dsh-artifact

[English](README.md) · **简体中文**

<p align="center"><img src="assets/logo.svg" width="128" alt="dsh-artifact logo"/></p>

> 在 DeepSeek Harness 对话中内联渲染**交互式 ECharts 图表**。

`dsh-artifact` 让模型在对话里直接渲染**真实、可交互**的图表——不是手绘 SVG，也不是一堆文字。模型调用 `render_artifact` 工具，传入**声明式的 ECharts `option`**（纯 JSON、无函数），Web UI 就用真正的 ECharts 引擎渲染出来：tooltip、缩放、图例，以及 ECharts 支持的全部图表类型（柱状 / 折线 / 饼图 / 散点 / 热力图 / 雷达 / 仪表盘 / 漏斗 / 桑基图 / 关系图 / 地图 / 盒须图 / 旭日图 / K 线等）。

## 为什么做 dsh-artifact

| | dsh-genui | dsh-visualize | **dsh-artifact** |
|---|---|---|---|
| 模型产物 | 白名单 JSON 组件树 | 任意 HTML/JS | **声明式 ECharts option** |
| 真实图表引擎 | ✗（手绘 3 种图） | ✓（靠 HTML） | **✓（完整 ECharts）** |
| 对话内内联 | ✓ | ✗（仅工具行） | ✓（工具卡片） |
| 可交互 | ✓ | 部分 | ✓（tooltip / 缩放 / 图例） |
| 交互回环 | ✓ | ✗ | 路线图（v0.3） |
| 安全模型 | 白名单 | 沙箱 iframe | **纯 JSON、无函数** |

`dsh-genui` 手绘了三种图表、能力有限；`dsh-visualize` 能渲染任意 HTML 却没有交互回环。`dsh-artifact` 把**声明式 JSON option 喂给真正的 ECharts 引擎**——模型最擅长写 JSON，却因此获得全量图表能力，成本更低，且以「纯 JSON、无函数」作为严格的安全边界。

## 安装

```sh
# 从 GitHub 安装（推荐，仓库已包含构建产物，无需额外构建）
dsh plugin --profile web add github:sumarilkkxx/dsh-artifact

# 本地目录链接（开发调试）
dsh plugin --profile web add link:/path/to/dsh-artifact

# 从项目目录
dsh plugin --profile web add .
```

重启 `dsh web` 并强制刷新页面（Cmd/Ctrl+Shift+R）。

> 需要 `pnpm` 在 `PATH` 中（`dsh plugin` 命令内部会转发给 pnpm）。

## 使用

直接对模型说：

> 画一张 2024 年四个季度的收入柱状图：120、180、150、210 万元

模型会调用 `render_artifact` 并传入 ECharts option，图表即以交互卡片的形式出现在对话中。

### 工具参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `option` | object / string | 是 | ECharts 配置（纯 JSON，**禁止函数**；formatter 用字符串模板，如 `{c}%`） |
| `engine` | string | 否 | 渲染引擎，当前仅支持 `echarts` |
| `title` | string | 否 | 卡片标题 |
| `height` | number | 否 | 图表高度 px（默认 360，最小 120） |

模型实际产出的示例 option：

```json
{
  "engine": "echarts",
  "title": "2024 年季度收入柱状图",
  "option": {
    "title":  { "text": "2024 年季度收入（万元）", "left": "center" },
    "tooltip": { "trigger": "axis" },
    "xAxis":   { "type": "category", "name": "季度", "data": ["Q1", "Q2", "Q3", "Q4"] },
    "yAxis":   { "type": "value", "name": "收入（万元）" },
    "series":  [{ "type": "bar", "name": "收入", "data": [120, 180, 150, 210] }]
  }
}
```

### 安全模型

- `option` 必须是**纯 JSON**——函数、`undefined`、`symbol` 会被宿主半拒绝（并引导模型用 ECharts 字符串模板写 formatter）。
- 引擎资产只从插件自己的路由提供，路径穿越被拦截。
- v0.1 没有任何「任意 HTML/脚本」通道。

## 工作原理

```
dsh-artifact/
├── index.js               # 宿主半：render_artifact 工具 + system prompt + 资产路由
├── client.js              # 浏览器半：keyed toolview 槽位 + 懒加载 ECharts 渲染
├── cordis.patch.yml       # bundle 层（insert dsh-artifact）
├── package.json           # dsh.bundle + dsh.client 清单
├── assets/echarts.min.js  # ECharts UMD（已构建，随仓库提交，供 git 安装）
└── scripts/build.mjs      # 复制 echarts dist -> assets/
```

1. **宿主半**（`index.js`）：以 raw JSON-Schema 定义注册 `render_artifact` 工具，注入 system-prompt 引导，并从 `/plugins/dsh-artifact/assets/*` 提供 ECharts 资产。
2. **浏览器半**（`client.js`）：为 `render_artifact` 注册 keyed `tool.call.toolview` 槽位。工具结果落定后，宿主通过 `presentationMeta` 把解析好的 option 投影到结果 `meta`，toolview 读取后用真实 ECharts 引擎渲染（首次使用时懒加载）。
3. **零 `@deepseek-ai/*` 运行时依赖**——两个半都是手写纯 JS：宿主只用 Node 内置模块，浏览器半从 loader 的模块表取 `react`。这刻意规避了 developer-preview 阶段的版本漂移陷阱（`@deepseek-ai/dsh-tools` 的过期 `latest` 标签、跨包 rc 线不一致等）。

## 开发

### 前置条件

- Node.js `>= 22.19`
- `pnpm` 在 `PATH` 中（`dsh plugin add` 依赖）
- `git`

### 项目结构

| 路径 | 作用 |
|---|---|
| `index.js` | 宿主半——`render_artifact` 工具定义、system-prompt 引导、懒加载资产路由 |
| `client.js` | 浏览器半——keyed toolview 组件、ECharts 懒加载（module-loader 协议） |
| `cordis.patch.yml` | bundle 层；`name` 是**包名**（经 node_modules 解析），不是相对路径 |
| `package.json` | `dsh.bundle` + `dsh.client` 清单、`exports["./client"]`、构建脚本 |
| `assets/echarts.min.js` | ECharts UMD 构建产物（已提交，保证 `dsh plugin add github:...` 免构建） |
| `scripts/build.mjs` | 把 `node_modules/echarts/dist/echarts.min.js` 复制到 `assets/` |

### 构建

```sh
npm install     # 安装 echarts（仅构建期依赖，不是运行时依赖）
npm run build   # 复制 echarts UMD 到 assets/
```

`echarts` 是 **devDependency**，只用于产出 `assets/echarts.min.js`。插件本身零运行时依赖，所以 `link:` 安装无需任何额外步骤。升级引擎时，改 `package.json` 里的 echarts devDependency 版本再重新 `npm run build` 即可。

### 本地调试循环

```sh
# 在项目目录下
dsh plugin --profile web add .

# 重启 dsh web + 强制刷新页面
```

宿主半和浏览器半都是 profile 直接读取的普通文件，所以改代码只需重启（无需构建）。只有改了引擎资产时才需要重新构建。

### 验收

```sh
# 组合校验：确认 bundle 层能正确解析并组合
dsh --profile <name> --dump-config

# 本地冒烟测试（未随仓库发布）
node scripts/smoke-test.mjs

# 浏览器渲染检查：加载 profile，确认零 console 报错 + 画出 canvas
#（开发期使用的完整验收流程）
```

### 设计说明

- **raw 工具定义**：`render_artifact` 用纯 JSON-Schema 对象注册（而非 `defineTool`），因为 developer-preview 阶段对 `@deepseek-ai/dsh-tools` 的 out-of-tree 解析不可靠。宿主半自己负责校验。
- **可选服务用 `ctx.inject`**：资产路由用 `ctx.inject(['webServer'], cb)`，这样在 headless profile 下（没有 webServer 服务）插件保持静默、不报错。
- **可回放呈现**：图表 option 通过工具结果的 `meta`（`presentationMeta`）传给浏览器，必须保持纯函数（无文件 I/O），这样 session 回放时才能重建卡片。

## 路线图

### v0.1 — ECharts 工具通道 ✅ 已发布

- `render_artifact` 工具（raw JSON-Schema 定义、无函数 option 校验）
- 真实 ECharts 引擎，从自托管 `/plugins/dsh-artifact/assets/*` 路由懒加载
- keyed `tool.call.toolview` 浏览器槽位
- 纯 JSON 安全边界（函数 / `undefined` / `symbol` 拒绝 + 路径穿越拦截）
- 端到端验收：真实模型调用 → 工具 → 结果 meta → 浏览器 canvas

### v0.2 — 多引擎 + HTML 沙箱（规划中）

- 新增引擎：**mermaid**（流程图 / 时序图 / 类图 / 甘特图）、**three.js**（3D 场景）
- 第二个工具（`render_html`）：把模型写的 HTML/CSS/JS 渲染进**沙箱 `iframe`**（不透明源 + CSP），覆盖声明式引擎表达不了的自定义组件
- 输入区 dock 的流式预览
- 引擎资产打包通用化（每引擎一个 IIFE 资产 + 共享加载器）

### v0.3 — 交互回环（规划中）

- 基于 `postMessage` 的 `[genui-action]` 回环：交互组件把数据回传模型、模型重新渲染——这正是 `dsh-visualize` 明确缺失的能力
- local-first 交互（标签切换、选中、本地判分）零模型往返

### 后续 / 想法

- 真正的图标系统（SVG 图标库，而非 emoji）
- 原生实时数据绑定——把组件绑定到宿主状态（token 用量、git 状态、子代理/任务进度），无需模型往返
- 更多引擎：katex（公式）、leaflet（地图）、frappe-gantt（时间线）
- 发布到 npm + 提交 `awesome-dsh-plugin` 收录

## 参与贡献

欢迎 PR。请保持宿主半和浏览器半**不引入 `@deepseek-ai/*` 运行时导入**，任何引擎变更都以提交的 `assets/` 产物（或更新 `scripts/build.mjs`）形式交付。给仓库加上 `dsh-plugin` GitHub topic 有助于他人发现本插件。

## License

[MIT](LICENSE)
