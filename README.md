# dsh-artifact

**English** · [简体中文](README.zh-CN.md)

> Render interactive **ECharts / Mermaid / Three.js** and sandboxed custom HTML inline in DeepSeek Harness conversations.

`dsh-artifact` lets the model render real, interactive content — not hand-drawn SVG, not a wall of text — directly inside the conversation. The model calls `render_artifact` with a **declarative payload** — a plain-JSON ECharts `option`, a Mermaid diagram, or a Three.js 3D scene — and the Web UI renders it with the real engine (tooltip, zoom, legend, diagrams, 3D previews). A second tool, `render_html`, renders arbitrary custom HTML/CSS/JS in a **sandboxed iframe**.

## Why dsh-artifact

| | dsh-genui | dsh-visualize | **dsh-artifact** |
|---|---|---|---|
| Model output | whitelisted JSON tree | arbitrary HTML/JS | **declarative payload (ECharts / Mermaid / Three)** |
| Real engine | ✗ (3 hand-drawn chart kinds) | ✓ (via HTML) | **✓ (ECharts + Mermaid + Three.js)** |
| Inline in conversation | ✓ | ✗ (tool row only) | ✓ (tool card) |
| Interactive | ✓ | partial | ✓ (tooltip / zoom / legend / 3D) |
| Arbitrary HTML sandbox | ✗ | ✓ | **✓ (`render_html`)** |
| Action round-trip | ✓ | ✗ | roadmap (v0.3) |
| Security model | whitelist | sandboxed iframe | **pure JSON + sandboxed iframe** |

`dsh-genui` hand-draws three chart kinds; `dsh-visualize` renders arbitrary HTML but has no round-trip. `dsh-artifact` feeds the **real engines** (ECharts, Mermaid, Three.js) with **declarative JSON payloads** the model is already excellent at writing, and adds a **sandboxed HTML** channel for custom widgets — full capability at a lower authoring cost, behind strict JSON-only and iframe-sandbox security boundaries.

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

### `render_artifact` (charts / diagrams / 3D)

| Parameter | Type | Description |
|---|---|---|
| `engine` | string | `echarts` (default) · `mermaid` · `three` |
| `option` | object / string | ECharts option — engine=echarts (plain JSON, **no functions**; string templates like `{c}%`) |
| `code` | string | Mermaid diagram source — engine=mermaid (flowchart / sequenceDiagram / classDiagram / gantt / stateDiagram / pie / erDiagram / journey) |
| `spec` | object / string | Three.js scene — engine=three (`{"meshes":[{shape,color,size,position,rotation}],"background","ambient"}`) |
| `theme` | string | Optional ECharts-inspired palette: `auto` · `tech-blue` (ECharts 5) · `minimal` (Vintage) · `night-purple` (Macarons) · `forest` (Shine) · `amber` (Roma) |
| `mode` | string | Optional render surface: `auto` (system default) · `light` · `dark`; uses ECharts 5 light/default and dark component tokens, with a host-aligned dark canvas of `#040810` |
| `title` | string | Card title |
| `height` | number | Height in px (default 360, min 120) |

### `render_html` (sandboxed custom widget)

| Parameter | Type | Description |
|---|---|---|
| `html` | string | Self-contained HTML fragment or full document (inline scripts/styles allowed; external resources blocked) |
| `title` | string | Card title |
| `height` | number | Height in px (default 400, min 120) |

Example the model produces:

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

- Declarative payloads (`option` / `spec`) must be **pure JSON** — functions, `undefined`, and symbols are rejected by the host half.
- Engine assets are served only from the plugin's own route; path traversal is blocked.
- `render_html` widgets run in a **sandboxed iframe** (opaque origin) with a CSP that blocks network, top navigation, and form submission; only inline scripts/styles are allowed.

## How it works

```
dsh-artifact/
├── index.js               # host half: render_artifact + render_html tools + asset route
├── client.js              # browser half: keyed toolviews + engine dispatch + sandboxed iframe
├── cordis.patch.yml       # bundle layer (insert dsh-artifact)
├── package.json           # dsh.bundle + dsh.client manifests
├── assets/                # engine UMDs (echarts/mermaid/three; built, shipped for git-install)
└── scripts/build.mjs      # copies engine dists -> assets/
```

1. **Host half** (`index.js`) registers `render_artifact` and `render_html` as raw JSON-Schema definitions, injects system-prompt guidance, and serves the engine assets from `/plugins/dsh-artifact/assets/*`.
2. **Browser half** (`client.js`) registers keyed `tool.call.toolview` slots for both tools. When a result settles, the host projects the resolved payload into the result `meta` (via `presentationMeta`); the toolview dispatches on `meta.engine` and lazy-loads the matching engine. `render_html` renders into a sandboxed `iframe` with a CSP.
3. **Zero `@deepseek-ai/*` runtime dependencies** — both halves are hand-written plain JS. The host uses only Node builtins; the browser half takes `react` from the loader's module table. This deliberately avoids the developer-preview version-drift trap (the stale `latest` tag on `@deepseek-ai/dsh-tools`, and cross-package rc-line mismatches).

## Development

### Prerequisites

- Node.js `>= 22.19`
- `pnpm` on `PATH` (required by `dsh plugin add`)
- `git`

### Project layout

| Path | Purpose |
|---|---|
| `index.js` | Host half — `render_artifact` + `render_html` tool definitions, system-prompt section, lazy-asset route |
| `client.js` | Browser half — keyed toolviews, engine dispatch (echarts/mermaid/three), sandboxed iframe |
| `cordis.patch.yml` | Bundle layer; `name` is a **package name** resolved through node_modules, not a path |
| `package.json` | `dsh.bundle` + `dsh.client` manifests, `exports["./client"]`, build scripts |
| `assets/*.min.js` | Engine UMD builds (echarts/mermaid/three; committed so `dsh plugin add github:...` needs no build) |
| `scripts/build.mjs` | Copies engine dists → `assets/` |

### Build

```sh
npm install     # installs echarts/mermaid/three (build-time only; NOT runtime deps)
npm run build   # copies the engine UMD bundles into assets/
```

The engines are **devDependencies** used only to produce `assets/*.min.js`. The plugin itself has zero runtime dependencies, so a `link:` install needs nothing extra. Bump an engine by editing its devDependency version and re-running `npm run build`.

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

### v0.2 — multi-engine + HTML sandbox ✅ shipped

- Additional engines: **mermaid** (flow/sequence/class/gantt/state/pie/er/journey), **three.js** (declarative 3D scenes)
- A second tool (`render_html`): render model-written HTML/CSS/JS in a **sandboxed `iframe`** (opaque origin + CSP) for custom widgets the declarative engines cannot express
- Engine asset bundling generalized (per-engine UMD assets + a shared lazy loader)
- Verified end-to-end: all three engines render in a real browser; the sandbox runs inline scripts while blocking network

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
