# dsh-artifact

> Render interactive **ECharts** charts inline in DeepSeek Harness conversations.

[简体中文](README.zh-CN.md)

`dsh-artifact` lets the model render real, interactive charts — not hand-drawn SVG, not a wall of text — directly inside the conversation. The model calls the `render_artifact` tool with a **declarative ECharts `option`** (plain JSON, no functions), and the Web UI renders it with the actual ECharts engine: tooltip, zoom, legend, and every chart type ECharts supports (bar, line, pie, scatter, heatmap, radar, gauge, funnel, sankey, graph, map, boxplot, sunburst, candlestick, and more).

## Why dsh-artifact

| | dsh-genui | dsh-visualize | **dsh-artifact** |
|---|---|---|---|
| Model output | whitelisted JSON tree | arbitrary HTML/JS | **declarative ECharts option** |
| Real chart engine | ✗ (3 hand-drawn kinds) | ✓ (via HTML) | **✓ (full ECharts)** |
| Inline in conversation | ✓ | ✗ (tool row only) | ✓ (tool card) |
| Interactive | ✓ | partial | ✓ (tooltip / zoom / legend) |
| Action round-trip | ✓ | ✗ | roadmap (v0.3) |
| Security model | whitelist | sandboxed iframe | **pure JSON, no functions** |

`dsh-genui` hand-draws three chart kinds; `dsh-visualize` renders arbitrary HTML but has no round-trip. `dsh-artifact` feeds the **real ECharts engine** with a **declarative JSON option** the model is already excellent at writing — full chart capability at a lower authoring cost, behind a strict JSON-only security boundary.

## Install

```sh
# From GitHub (recommended — ships prebuilt assets, no build step)
dsh plugin --profile web add github:sumarilkkxx/dsh-artifact

# Local link (development)
dsh plugin --profile web add link:/path/to/dsh-artifact

# From the project directory
dsh plugin --profile web add .
```

Restart `dsh web` and hard-refresh the page (Cmd/Ctrl+Shift+R).

> Requires `pnpm` on `PATH` (the `dsh plugin` command forwards to pnpm).

## Usage

Ask the model for a chart:

> Draw a bar chart of 2024 quarterly revenue: 120, 180, 150, 210 (in 10k CNY)

The model calls `render_artifact` with an ECharts option, and the chart appears as an interactive card in the conversation.

### Tool reference

| Parameter | Type | Required | Description |
|---|---|---|---|
| `option` | object / string | yes | ECharts option (plain JSON, **no functions**; use string templates like `{c}%` for formatters) |
| `engine` | string | no | Rendering engine; only `echarts` in this version |
| `title` | string | no | Card title |
| `height` | number | no | Chart height in px (default 360, min 120) |

Example option the model produces:

```json
{
  "engine": "echarts",
  "title": "2024 quarterly revenue",
  "option": {
    "title":  { "text": "Revenue (10k CNY)", "left": "center" },
    "tooltip": { "trigger": "axis" },
    "xAxis":   { "type": "category", "name": "Quarter", "data": ["Q1", "Q2", "Q3", "Q4"] },
    "yAxis":   { "type": "value", "name": "Revenue" },
    "series":  [{ "type": "bar", "name": "Revenue", "data": [120, 180, 150, 210] }]
  }
}
```

### Security model

- The `option` must be **pure JSON** — functions, `undefined`, and symbols are rejected by the host half (the model is instructed to use ECharts string templates for formatters).
- The engine asset is served only from the plugin's own route; path traversal is blocked.
- No arbitrary HTML/script path exists in v0.1.

## How it works

```
dsh-artifact/
├── index.js               # host half: render_artifact tool + system prompt + asset route
├── client.js              # browser half: keyed toolview slot + lazy ECharts render
├── cordis.patch.yml       # bundle layer (insert dsh-artifact)
├── package.json           # dsh.bundle + dsh.client manifests
├── assets/echarts.min.js  # ECharts UMD (built, shipped for git-install)
└── scripts/build.mjs      # copies echarts dist -> assets/
```

1. **Host half** (`index.js`) registers the `render_artifact` tool as a raw JSON-Schema definition, injects system-prompt guidance, and serves the ECharts asset from `/plugins/dsh-artifact/assets/*`.
2. **Browser half** (`client.js`) registers the keyed `tool.call.toolview` slot for `render_artifact`. When a result settles, the host projects the resolved option into the result `meta` (via `presentationMeta`); the toolview reads it and renders with the real ECharts engine, lazy-loaded on first use.
3. **Zero `@deepseek-ai/*` runtime dependencies** — both halves are hand-written plain JS. The host uses only Node builtins; the browser half takes `react` from the loader's module table. This deliberately avoids the developer-preview version-drift trap (the stale `latest` tag on `@deepseek-ai/dsh-tools`, and cross-package rc-line mismatches).

## Development

### Prerequisites

- Node.js `>= 22.19`
- `pnpm` on `PATH` (required by `dsh plugin add`)
- `git`

### Project layout

| Path | Purpose |
|---|---|
| `index.js` | Host half — `render_artifact` tool definition, system-prompt section, lazy-asset route |
| `client.js` | Browser half — keyed toolview component, ECharts lazy loader (module-loader protocol) |
| `cordis.patch.yml` | Bundle layer; `name` is a **package name** resolved through node_modules, not a path |
| `package.json` | `dsh.bundle` + `dsh.client` manifests, `exports["./client"]`, build scripts |
| `assets/echarts.min.js` | ECharts UMD build (committed so `dsh plugin add github:...` needs no build) |
| `scripts/build.mjs` | Copies `node_modules/echarts/dist/echarts.min.js` → `assets/` |

### Build

```sh
npm install     # installs echarts (build-time only; NOT a runtime dependency)
npm run build   # copies the echarts UMD bundle into assets/
```

`echarts` is a **devDependency** used only to produce `assets/echarts.min.js`. The plugin itself has zero runtime dependencies, so a `link:` install needs nothing extra. Bump the engine by editing the `echarts` devDependency version and re-running `npm run build`.

### Local debug loop

```sh
# from the project directory
dsh plugin --profile web add .

# restart dsh web + hard-refresh the page
```

The host and browser halves are plain files the profile reads directly, so code edits need only a restart (no build step). Rebuild only when you change the engine asset.

### Verification

```sh
# compose-check: confirms the bundle layer parses and composes
dsh --profile <name> --dump-config

# local smoke test (not shipped in the repo)
node scripts/smoke-test.mjs

# browser render check: load the profile, confirm zero console errors and a painted canvas
# (see the acceptance flow used during development)
```

### Design notes

- **Raw tool definition.** `render_artifact` is registered as a plain JSON-Schema object (not `defineTool`) because out-of-tree resolution of `@deepseek-ai/dsh-tools` is unreliable on the developer-preview line. The host half owns its own validation.
- **Optional service via `ctx.inject`.** The asset route uses `ctx.inject(['webServer'], cb)` so the plugin stays inert under headless profiles (no webServer service).
- **Replay-safe presentation.** The chart option travels to the browser through the tool result's `meta` (`presentationMeta`), which must stay pure (no file I/O) so session replay can rebuild the card.

## Roadmap

### v0.1 — ECharts tool channel ✅ shipped

- `render_artifact` tool (raw JSON-Schema definition, function-free option validation)
- Real ECharts engine, lazy-loaded from a self-hosted `/plugins/dsh-artifact/assets/*` route
- Keyed `tool.call.toolview` browser slot
- Pure-JSON security boundary (function/`undefined`/symbol rejection + path-traversal guard)
- Verified end-to-end: real model call → tool → result meta → browser canvas

### v0.2 — multi-engine + HTML sandbox (planned)

- Additional engines: **mermaid** (flow/sequence/class/gantt), **three.js** (3D scenes)
- A second tool (`render_html`): render model-written HTML/CSS/JS in a **sandboxed `iframe`** (opaque origin + CSP) for custom widgets the declarative engines cannot express
- Streaming preview in the composer input dock
- Engine asset bundling generalized (per-engine IIFE assets + a shared loader)

### v0.3 — action round-trip (planned)

- `postMessage`-based `[genui-action]` loop: interactive components send data back to the model, which re-renders — the capability `dsh-visualize` explicitly lacks
- Local-first interactions (tabs, selection, local grading) with zero model round-trip

### Later / ideas

- Real icon system (SVG icon library, not emoji)
- Native live data binding — bind components to host state (token usage, git status, subagent/job progress) without a model round-trip
- More engines: katex (formulas), leaflet (maps), frappe-gantt (timelines)
- npm publish + `awesome-dsh-plugin` listing

## Contributing

PRs welcome. Please keep the host and browser halves free of `@deepseek-ai/*` runtime imports, and ship any engine change as a committed `assets/` artifact (or update `scripts/build.mjs`). Add the `dsh-plugin` GitHub topic to help others discover the plugin.

## License

[MIT](LICENSE)
