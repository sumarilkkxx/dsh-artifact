# dsh-artifact

在 DeepSeek Harness 对话中内联渲染**交互式 ECharts 图表**。

模型调用 `render_artifact` 工具，传入声明式的 ECharts `option`（纯 JSON、无函数），Web UI 就会在对话里渲染出一张**真实、可交互**的图表卡片——tooltip、缩放、图例，以及 ECharts 支持的全部图表类型：柱状 / 折线 / 饼图 / 散点 / 热力图 / 雷达 / 仪表盘 / 漏斗 / 桑基图 / 关系图 / 地图 / 盒须图 / 旭日图等。

## 为什么

- `dsh-genui` 手绘了三种图表（柱状 / 折线 / 环图），能力有限；
- `dsh-visualize` 能渲染任意 HTML，但没有「交互回环」；
- `dsh-artifact` 把**声明式 JSON option 喂给真正的 ECharts 引擎**——模型最擅长写 JSON，却因此获得全量图表能力，无需写任何代码。

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

## 使用

直接对模型说：

> 用 render_artifact 画一张柱状图，展示 2024 年四个季度的收入：120、180、150、210 万元

模型会调用 `render_artifact` 工具并传入 ECharts option，图表即出现在对话的工具卡片中。

**工具参数**：

| 参数 | 类型 | 说明 |
|---|---|---|
| `option` | object / string | ECharts 图表配置（纯 JSON，**禁止函数**；formatter 用字符串模板，如 `{c}%`） |
| `engine` | string | 渲染引擎，当前仅支持 `echarts` |
| `title` | string | 卡片标题（可选） |
| `height` | number | 图表高度 px（默认 360，最小 120） |

示例（模型实际产出）：

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

## 工作原理

- **宿主半**（`index.js`）：注册 `render_artifact` 工具（raw JSON-Schema 定义）、system-prompt 引导、以及 `/plugins/dsh-artifact/assets/*` 资产路由，懒加载 ECharts 引擎。
- **浏览器半**（`client.js`）：按工具名注册 `tool.call.toolview` 槽位，从结果 meta 读取 option，用真正的 ECharts 引擎渲染。
- **零 `@deepseek-ai/*` 运行时依赖**：宿主半与浏览器半均为手写纯 JS，彻底规避 developer-preview 阶段的版本漂移问题；唯一构建动作是把 echarts UMD 复制进 `assets/`。

## 开发

```sh
npm install     # 安装 echarts（仅构建期依赖，不随插件下发）
npm run build   # 复制 echarts UMD 到 assets/
```

## 路线图

- **v0.2**：多引擎（mermaid / three）+ 任意 HTML 沙箱层
- **v0.3**：postMessage action 回环（交互数据回传模型，闭环）

## License

[MIT](LICENSE)
