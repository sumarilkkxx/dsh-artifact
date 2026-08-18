# dsh-artifact

[English](README.md) · **简体中文**

> 在 DeepSeek Harness 对话中内联渲染**交互式 ECharts（含 ECharts-GL 3D）/ Mermaid** 与沙箱化的自定义 HTML。

`dsh-artifact` 让模型在对话里直接渲染**真实、可交互**的内容——不是手绘 SVG，也不是一堆文字。模型调用 `render_artifact`，传入**声明式 payload**——纯 JSON 的 ECharts `option`（包括官方 ECharts-GL 3D series）或 Mermaid 图——Web UI 就用真正的引擎渲染出来。第二个工具 `render_html` 则把任意自定义 HTML/CSS/JS 渲染进**沙箱 iframe**。

## 为什么做 dsh-artifact

| | dsh-genui | dsh-visualize | **dsh-artifact** |
|---|---|---|---|
| 模型产物 | 白名单 JSON 组件树 | 任意 HTML/JS | **声明式 payload（ECharts / ECharts-GL / Mermaid）** |
| 真实引擎 | ✗（手绘 3 种图） | ✓（靠 HTML） | **✓（ECharts + ECharts-GL + Mermaid）** |
| 对话内内联 | ✓ | ✗（仅工具行） | ✓（工具卡片） |
| 可交互 | ✓ | 部分 | ✓（tooltip / 缩放 / 图例 / 3D） |
| 任意 HTML 沙箱 | ✗ | ✓ | **✓（`render_html`）** |
| 交互回环 | ✓ | ✗ | 路线图（v0.3） |
| 安全模型 | 白名单 | 沙箱 iframe | **纯 JSON + 沙箱 iframe** |

`dsh-genui` 手绘了三种图表、能力有限；`dsh-visualize` 能渲染任意 HTML 却没有交互回环。`dsh-artifact` 把**声明式 JSON payload 喂给真正的引擎**（ECharts、其官方 ECharts-GL 扩展与 Mermaid），模型最擅长写 JSON，并额外提供**沙箱 HTML** 通道渲染自定义组件，成本更低，且以「纯 JSON + iframe 沙箱」作为严格的安全边界。

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

### `render_artifact`（ECharts 图表 / 图）

| 参数 | 类型 | 说明 |
|---|---|---|
| `engine` | string | `echarts`（默认，含 ECharts-GL 3D option）· `mermaid` |
| `option` | object / string | 原生 ECharts 配置——engine=echarts（纯 JSON，**禁止函数**；字符串模板如 `{c}%`） |
| `maps` | object / string | `geo` / `map` 图可选的命名 GeoJSON/SVG 注册表；每项会在 `echarts.init` 前以 `echarts.registerMap` 注册 |
| `code` | string | Mermaid 图源码——engine=mermaid（flowchart / sequenceDiagram / classDiagram / gantt / stateDiagram / pie / erDiagram / journey） |
| `theme` | string | 可选 ECharts 风格色板：`auto` · `tech-blue`（ECharts 5）· `minimal`（Vintage）· `night-purple`（Macarons）· `forest`（Shine）· `amber`（Roma） |
| `mode` | string | 可选渲染明暗：`auto`（默认跟随系统）· `light` · `dark`；按 ECharts 5 浅色默认与 dark 组件 token 控制文字、网格和提示框，深色画布使用宿主一致的 `#040810` |
| `title` | string | 卡片标题 |
| `height` | number | 高度 px（默认 360，最小 120） |

### 原生 ECharts 兼容性

浏览器卡片创建完整的 ECharts 6 实例，并将 `option` **原样**传给
`setOption`；它不会把复杂需求翻译成有限的预设。因此，所有可用 JSON
表达的官方组件和 series 都按原生规范工作：笛卡尔、calendar、polar、radar、
geo/map、graph、层级图、parallel、timeline，以及 `dataset`、`visualMap`、
`dataZoom`、`graphic` 等。

画布内「外观」菜单通过注册 ECharts 原生主题实现（`echarts.registerTheme`
后再 `echarts.init`）。这让每一个内置组件都能获得一致的深浅色 token，
同时保留用户在 option 中明确给出的配置，遵循 ECharts 的主题优先级。

JavaScript 回调无法穿过工具的 JSON 安全边界。formatter 请优先使用 ECharts
字符串模板；`custom` series 的 `renderItem` 等仅回调 API，可用自包含的
`render_html` 实现。地图需通过 `maps` 随调用提供有合法使用权的 GeoJSON/SVG；
插件不会从网络下载地图数据。

### 官方 ECharts-GL 3D 图表

3D 数据可视化仍传 `engine: "echarts"`。当 option 使用 `scatter3D`、`bar3D`、
`line3D`、`lines3D`、`surface`、`map3D`、`grid3D` 或 `globe` 等官方配置时，
卡片会按需加载 ECharts-GL。非破坏性的质量编译层只补齐 `globe`、
`grid3D` / `surface` 与 `geo3D` / `map3D` 缺失的光照、相机、后处理和布局。
内置离线地球基线包含官方示例的地表、地形、星场和 HDR 环境，无需外网请求。

画布内「外观」菜单位于所有 WebGL 图层之上。原生 ECharts 图表保留完整的多色分类
主题；非 Globe 的 ECharts-GL 数据图则展示为深度与材质可读性调校的单色系阶梯：
深海蓝、翡翠绿、琥珀金、洋红紫、石墨灰。真实贴图 Globe 只展示“背景”按钮和
深浅模式：卫星贴图是地理影像而非数据色板，菜单绝不会为其换色。用户明确给出的
纹理、环境、材质、相机、光照、颜色和大气层配置会被保留。这是面向数据可视化的
能力，不用于任意 3D 模型或游戏场景搭建。

### 下载图片

每个 `render_artifact` 的 ECharts/ECharts-GL 或 Mermaid 卡片在完成渲染后，都会在
画布内显示下载按钮，可按当前深浅背景导出 2× PNG；浮动的外观控件不会被导出。
`render_html` 仍处于沙箱中，宿主无法安全读取不透明 iframe 的内容，因此不提供导出
按钮。

### `render_html`（沙箱化自定义组件）

| 参数 | 类型 | 说明 |
|---|---|---|
| `html` | string | 自包含的 HTML 片段或完整文档（允许内联脚本/样式；外部资源被拦截） |
| `title` | string | 卡片标题 |
| `height` | number | 高度 px（默认 400，最小 120） |

模型实际产出的示例：

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

- 声明式 ECharts `option` 必须是**纯 JSON**——函数、`undefined`、`symbol` 会被宿主半拒绝。
- 引擎资产只从插件自己的路由提供，路径穿越被拦截。
- `render_html` 组件运行在**沙箱 iframe**（不透明源）中，CSP 拦截网络、顶层导航与表单提交，仅允许内联脚本/样式。

## 工作原理

```
dsh-artifact/
├── index.js               # 宿主半：render_artifact + render_html 工具 + 资产路由
├── client.js              # 浏览器半：keyed toolviews + 引擎分发 + 沙箱 iframe
├── cordis.patch.yml       # bundle 层（insert dsh-artifact）
├── package.json           # dsh.bundle + dsh.client 清单
├── assets/                # 引擎 UMD（echarts/echarts-gl/mermaid；已构建，随仓库提交）
└── scripts/build.mjs      # 复制引擎 dist -> assets/
```

1. **宿主半**（`index.js`）：以 raw JSON-Schema 定义注册 `render_artifact` 与 `render_html` 两个工具，注入 system-prompt 引导，并从 `/plugins/dsh-artifact/assets/*` 提供引擎资产。
2. **浏览器半**（`client.js`）：为两个工具注册 keyed `tool.call.toolview` 槽位。工具结果落定后，宿主通过 `presentationMeta` 把解析好的 payload 投影到结果 `meta`，toolview 按 `meta.engine` 分发并懒加载对应引擎；`render_html` 渲染进带 CSP 的沙箱 `iframe`。
3. **零 `@deepseek-ai/*` 运行时依赖**——两个半都是手写纯 JS：宿主只用 Node 内置模块，浏览器半从 loader 的模块表取 `react`。这刻意规避了 developer-preview 阶段的版本漂移陷阱（`@deepseek-ai/dsh-tools` 的过期 `latest` 标签、跨包 rc 线不一致等）。

## 开发

### 前置条件

- Node.js `>= 22.19`
- `pnpm` 在 `PATH` 中（`dsh plugin add` 依赖）
- `git`

### 项目结构

| 路径 | 作用 |
|---|---|
| `index.js` | 宿主半——`render_artifact` + `render_html` 工具定义、system-prompt 引导、懒加载资产路由 |
| `client.js` | 浏览器半——keyed toolviews、ECharts/ECharts-GL/Mermaid 分发、沙箱 iframe |
| `cordis.patch.yml` | bundle 层；`name` 是**包名**（经 node_modules 解析），不是相对路径 |
| `package.json` | `dsh.bundle` + `dsh.client` 清单、`exports["./client"]`、构建脚本 |
| `assets/*.min.js` | 引擎 UMD 构建产物（echarts/echarts-gl/mermaid；已提交，保证 `dsh plugin add github:...` 免构建） |
| `scripts/build.mjs` | 把引擎 dist 复制到 `assets/` |

### 构建

```sh
npm install     # 安装 echarts/echarts-gl/mermaid（仅构建期依赖，不是运行时依赖）
npm run build   # 复制引擎 UMD 到 assets/
```

引擎都是 **devDependency**，只用于产出 `assets/*.min.js`。插件本身零运行时依赖，所以 `link:` 安装无需任何额外步骤。升级引擎时，改 `package.json` 里对应 devDependency 版本再重新 `npm run build` 即可。

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

### v0.2 — 多引擎 + HTML 沙箱 ✅ 已发布

- 新增引擎：**mermaid**（流程图 / 时序图 / 类图 / 甘特图 / 状态图 / 饼图 / ER 图 / 旅程图）；3D 数据可视化使用官方 **ECharts-GL**
- 第二个工具（`render_html`）：把模型写的 HTML/CSS/JS 渲染进**沙箱 `iframe`**（不透明源 + CSP），覆盖声明式引擎表达不了的自定义组件
- 引擎资产打包通用化（每引擎一个 UMD 资产 + 共享懒加载器）
- 端到端验收：三个引擎均在真实浏览器渲染；沙箱运行内联脚本的同时拦截网络

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
