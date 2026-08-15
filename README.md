# dsh-artifact

Render interactive **ECharts** charts inline in DeepSeek Harness conversations.

The model calls the `render_artifact` tool with a declarative ECharts `option`
(plain JSON, no functions) and the Web UI renders it as a real, interactive
chart card — tooltip, zoom, legend, and every ECharts chart type — instead of a
wall of text or a hand-drawn SVG.

## Why

`dsh-genui` hand-draws three chart kinds (bars/line/donut); `dsh-visualize`
renders arbitrary HTML but has no round-trip. `dsh-artifact` feeds the **real
ECharts engine** with a **declarative JSON option** the model is already good at
writing — full chart capability at a lower authoring cost, no arbitrary code.

## Install

```sh
# local link (development)
dsh plugin --profile web add link:/path/to/dsh-artifact

# from the project directory
dsh plugin --profile web add .
```

Then restart `dsh web` and hard-refresh. Ask the model for a chart, e.g.
"用 render_artifact 画一张最近三个月收入的柱状图".

## Build

The only build step copies the ECharts UMD bundle into `assets/`:

```sh
npm install
npm run build
```

## How it works

- **Host half** (`index.js`): registers the `render_artifact` tool (raw
  JSON-Schema tool definition, zero `@deepseek-ai/*` runtime imports), a
  system-prompt guidance section, and a `/plugins/dsh-artifact/assets/*` HTTP
  route serving the engine asset.
- **Browser half** (`client.js`): registers the keyed toolview for
  `render_artifact` and lazy-loads ECharts, rendering the option from the
  result meta.

## License

MIT
