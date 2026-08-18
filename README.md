<p align="center">
  <img src="assets/dsh-artifact-logo.svg" alt="dsh-artifact logo" width="96" />
</p>

<p align="center"><strong>Turn natural-language requests into native, interactive ECharts and Mermaid visualizations inside DeepSeek Harness.</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-5EEAD4?style=flat-square" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/runtime-DeepSeek%20Harness-60A5FA?style=flat-square" alt="DeepSeek Harness" />
  <img src="https://img.shields.io/badge/engines-ECharts%20%2B%20Mermaid-A78BFA?style=flat-square" alt="ECharts and Mermaid" />
  <img src="https://img.shields.io/badge/payload-pure%20JSON-34D399?style=flat-square" alt="Pure JSON payloads" />
</p>

<p align="center"><a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <img src="assets/dsh-artifact-banner.png" alt="dsh-artifact — native ECharts and Mermaid visualization canvas for DeepSeek Harness" width="100%" />
</p>

## What it is

`dsh-artifact` is a visualization renderer for DeepSeek Harness. Ask for a chart or diagram in ordinary language; the model understands the intent, chooses the appropriate native engine, emits a declarative payload, and the result appears directly in the conversation as an interactive canvas.

It is built for a near-native ECharts and Mermaid authoring experience—not a small set of hand-drawn chart templates. The browser receives a real ECharts option or Mermaid source and renders it with the real engine.

```text
Your request  →  model understands the intent  →  ECharts option / Mermaid code  →  interactive canvas
```

## Highlights

| | Capability |
|---|---|
| **Native engines** | ECharts 6, the official ECharts-GL extension when an option needs it, and Mermaid 11 |
| **Broad ECharts coverage** | Native JSON-expressible series and components: cartesian, pie, radar, calendar heatmap, graph, sankey, tree, map, parallel, timeline, `dataset`, `visualMap`, `dataZoom`, and more |
| **Diagram-first Mermaid** | Flowcharts, sequence, class, state, ER, gantt, journey, pie, and other Mermaid-supported diagrams |
| **Interactive canvas** | Tooltips, legends, zoom, pan, 3D controls, and responsive resizing come from the actual renderer |
| **Appearance controls** | In-canvas ECharts-inspired palettes and light/dark backgrounds; photographic globes retain their real-world surface and expose background mode only |
| **PNG export** | Download ECharts, ECharts-GL, and Mermaid results as 2× PNG images using the active canvas background |
| **Safe by design** | Pure JSON across the declarative boundary; isolated custom HTML runs in a CSP-restricted sandbox iframe |

## Install

```sh
# GitHub install (recommended; prebuilt engine assets are included)
dsh plugin --profile web add github:sumarilkkxx/dsh-artifact

# Local development
dsh plugin --profile web add link:/path/to/dsh-artifact
```

Restart `dsh web`, then hard-refresh the browser (`Cmd/Ctrl+Shift+R`). `pnpm` must be available on `PATH` because the DSH plugin command uses it internally.

## Use it naturally

Ask for the result you need. For example:

> Compare quarterly revenue and margin for 2024 in a dual-axis chart, highlight the best quarter, and use a dark canvas.

> Create a GitHub-style calendar heatmap for this year's daily commits.

> Draw a sequence diagram for OAuth login with success and failure paths.

The model calls `render_artifact` and returns a live canvas in the conversation. Use the **Appearance** control to switch palette/background where appropriate, and the adjacent **Download** action to save a PNG.

## Engine contract

### `render_artifact`

| Parameter | Type | Purpose |
|---|---|---|
| `engine` | string | `echarts` (default) or `mermaid` |
| `option` | object / string | A native ECharts option for `echarts`; pure JSON only, no JavaScript functions |
| `maps` | object / string | Optional legal GeoJSON/SVG registry for ECharts `geo` and `map` visualizations |
| `code` | string | Mermaid source for `mermaid` |
| `theme` | string | `auto`, `tech-blue`, `minimal`, `night-purple`, `forest`, or `amber` |
| `mode` | string | `auto`, `light`, or `dark` |
| `title` | string | Conversation card title |
| `height` | number | Canvas height in px (default `360`, minimum `120`) |

The plugin passes ECharts options to `setOption` without translating them into a preset catalogue. Explicit values in an option take precedence over the in-canvas theme, exactly as they do in ECharts. ECharts-GL is loaded only when a supported 3D option requires it; it remains an ECharts compatibility layer, not a separate 3D scene editor.

JavaScript callbacks cannot cross the JSON security boundary. Prefer ECharts string templates such as `{c}%` for formatters. For genuinely callback-driven custom experiences, use `render_html`.

### `render_html`

| Parameter | Type | Purpose |
|---|---|---|
| `html` | string | Self-contained HTML fragment or document; inline CSS/JS is allowed |
| `title` | string | Conversation card title |
| `height` | number | Canvas height in px (default `400`, minimum `120`) |

`render_html` is the deliberately separate escape hatch for custom widgets. It runs in an opaque-origin iframe with a CSP that blocks network access, top-level navigation, and form submission. Its contents cannot be exported by the host, so it intentionally has no PNG download control.

## Native ECharts example

```json
{
  "engine": "echarts",
  "title": "2024 quarterly revenue",
  "mode": "dark",
  "option": {
    "tooltip": { "trigger": "axis" },
    "legend": { "top": 28 },
    "xAxis": { "type": "category", "data": ["Q1", "Q2", "Q3", "Q4"] },
    "yAxis": { "type": "value", "name": "Revenue (10k CNY)" },
    "series": [{ "type": "bar", "name": "Revenue", "data": [120, 180, 150, 210] }]
  }
}
```

## Security and compatibility

- The declarative payload is validated as lossless JSON. Functions, `undefined`, and symbols are rejected.
- Engine assets are served only from the plugin route; traversal attempts are blocked.
- Map visualizations must include legal GeoJSON/SVG through `maps`; the plugin never fetches map data from the network.
- The plugin ships its renderer assets locally, so ECharts and Mermaid render without a CDN dependency.

## Development

```sh
npm install
npm run build

# Add the local plugin, then restart dsh web and hard-refresh.
dsh plugin --profile web add .
```

| Path | Description |
|---|---|
| `index.js` | Host tool definitions, validation, prompt guidance, and local asset route |
| `client.js` | DeepSeek Harness toolviews, renderer dispatch, appearance controls, and PNG export |
| `assets/` | Committed ECharts, ECharts-GL, Mermaid, and project SVG assets |
| `scripts/build.mjs` | Copies renderer distributions into `assets/` |

The plugin has no `@deepseek-ai/*` runtime imports. ECharts, ECharts-GL, and Mermaid are build-time dependencies used to create the committed local assets.

## Roadmap

- [x] Native ECharts and Mermaid canvases
- [x] ECharts-GL compatibility for JSON-expressible ECharts 3D options
- [x] Light/dark appearance controls and PNG export
- [x] Sandboxed HTML escape hatch
- [ ] Optional action round-trip from a canvas back to the model
- [ ] More declarative rendering engines

## Contributing

Contributions are welcome. Keep the declarative channel function-free, preserve the sandbox boundary, and commit rebuilt assets whenever an engine version changes.

## License

[MIT](LICENSE)
