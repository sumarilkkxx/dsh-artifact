// dsh-artifact — DeepSeek Harness host half.
//
// Registers the `render_artifact` tool (declarative ECharts options rendered
// inline as interactive chart cards), a system-prompt guidance section, and a
// self-hosted HTTP route serving the ECharts engine asset to the browser half.
//
// Deliberately zero `@deepseek-ai/*` runtime imports: the cordis Context is
// injected, services are reached through `ctx.<service>` exactly like
// @liustack/modlens registers its read_image tool. A raw JSON-Schema tool
// definition (not `defineTool`) is used because out-of-tree resolution of
// @deepseek-ai/dsh-tools is not reliable on the developer-preview line.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const PKG = 'dsh-artifact'
const TOOL_NAME = 'render_artifact'
const ASSET_ROUTE_PATH = `/plugins/${PKG}/assets`

// Safe flat file names only: no slashes, no traversal, .js assets only.
const ASSET_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/

export const name = PKG
export const inject = ['systemPrompt', 'tools']

const SYSTEM_PROMPT_TEXT = `You can render an interactive chart INLINE in the conversation by calling the ${TOOL_NAME} tool with an ECharts option. Use it whenever structured data reads better as a chart than as prose.

Vocabulary: ECharts option format (xAxis / yAxis / series / tooltip / legend / ...). Every ECharts chart type works: bar, line, pie, scatter, heatmap, radar, gauge, candlestick, funnel, sankey, graph, map, boxplot, sunburst, and more.

Rules:
- Pass \`option\` as a plain JSON OBJECT (preferred) — never a serialized JSON string.
- The option must be pure JSON: NO functions. For formatters use ECharts string templates (e.g. formatter: '{c}%' or '{b}: {c} {d}%').
- One chart per call, 3–8 series max, sensible axis labels, legend, and a \`title\` when it helps.
- Don't hardcode a full palette; ECharts defaults adapt to the app's light/dark theme.
- Use a chart when you have concrete numbers; for prose answers, skip it.`

/** Serve one flat .js asset from the plugin's own assets/ directory. */
async function serveAsset(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  const rel = pathname.startsWith(`${ASSET_ROUTE_PATH}/`) ? pathname.slice(ASSET_ROUTE_PATH.length + 1) : null
  if (rel === null || !ASSET_FILE_RE.test(rel)) {
    res.writeHead(404)
    res.end()
    return
  }
  try {
    const body = await readFile(fileURLToPath(new URL(`./assets/${rel}`, import.meta.url)))
    res.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
    })
    res.end(body)
  } catch {
    // Missing asset (not built yet): a loud 404; the client shows its fallback.
    res.writeHead(404)
    res.end()
  }
}

/** Parse a JSON string defensively; return undefined on failure. */
function parseJson(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Recursively reject values JSON cannot faithfully carry (functions/undefined/symbol). */
function isJsonSafe(value, depth) {
  if (depth > 128) return false
  if (value === null) return true
  const t = typeof value
  if (t === 'function' || t === 'undefined' || t === 'symbol') return false
  if (Array.isArray(value)) return value.every((v) => isJsonSafe(v, depth + 1))
  if (t === 'object') return Object.keys(value).every((k) => isJsonSafe(value[k], depth + 1))
  return true
}

/** Count top-level series for the render summary. */
function countSeries(option) {
  if (Array.isArray(option?.series)) return option.series.length
  return 0
}

/**
 * Unwrap the tool-call bridge's argument shapes. The bridge has been observed
 * to deliver arguments as `{option:<object>}`, `{option:"<json>"}`, or the
 * double-encoded `{arguments:"<json>"}` / `{arguments:<object>}` wrappers.
 */
function unwrapArgs(args) {
  if (typeof args === 'string') return { option: args }
  if (typeof args !== 'object' || args === null) return {}
  if ('option' in args) return args
  if ('arguments' in args) {
    const a = args.arguments
    if (typeof a === 'string') return { option: a }
    if (a && typeof a === 'object') return a
  }
  return args
}

/** Resolve the chart meta persisted onto the tool result for the browser half. */
function resolveMeta(args) {
  const a = unwrapArgs(args)
  return {
    engine: a.engine === 'echarts' ? 'echarts' : 'echarts',
    option: a.option ?? undefined,
    title: typeof a.title === 'string' ? a.title : undefined,
    height: typeof a.height === 'number' ? a.height : 360,
  }
}

/** Build the raw `render_artifact` tool definition. */
function createRenderArtifactTool() {
  return {
    name: TOOL_NAME,
    description:
      'Render an interactive ECharts chart inline in the conversation. Pass a plain-JSON ECharts `option` (xAxis/yAxis/series/...) and it appears as an interactive chart card with tooltip, zoom, and legend. '
      + 'Supports every ECharts chart type: bar, line, pie, scatter, heatmap, radar, gauge, candlestick, funnel, sankey, graph, map, boxplot, sunburst, and more. '
      + 'Use it whenever data reads better as a chart than as text. The option MUST be pure JSON — no functions (use ECharts string templates like "{c}%" for formatters).',
    parameters: {
      type: 'object',
      properties: {
        engine: {
          type: 'string',
          enum: ['echarts'],
          description: 'Rendering engine. Only "echarts" is supported in this version.',
        },
        option: {
          oneOf: [
            { type: 'object', description: 'The ECharts option as a plain JSON object.' },
            { type: 'string', description: 'The ECharts option serialized as a JSON string.' },
          ],
          description: 'The ECharts chart option (plain JSON, no functions). Pass as a JSON object (preferred) or a JSON string.',
        },
        title: {
          type: 'string',
          description: 'Optional card title shown above the chart.',
        },
        height: {
          type: 'number',
          description: 'Optional chart height in px (default 360, min 120).',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string', description: 'One-line human-readable render summary.' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
      // Replayable bridge: the browser toolview reads the resolved option from
      // the result's meta and renders the chart. Pure — args only, no I/O.
      presentationMeta: (args) => resolveMeta(args),
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: args?.title || TOOL_NAME }),
    presentResult: (args) => ({ card: 'generic', title: args?.title || TOOL_NAME }),
    async execute(args) {
      const a = unwrapArgs(args)
      const raw = a.option
      if (raw === undefined || raw === null) {
        return `${TOOL_NAME}: missing "option" — pass a plain-JSON ECharts option object.`
      }
      const option = typeof raw === 'string' ? parseJson(raw) : raw
      if (typeof option !== 'object' || option === null || Array.isArray(option)) {
        return `${TOOL_NAME}: "option" must be a JSON object (not a string/array).`
      }
      if (!isJsonSafe(option, 0)) {
        return `${TOOL_NAME}: "option" contains non-JSON values (functions/undefined). Use ECharts string templates for formatters instead of functions.`
      }
      const title = typeof a.title === 'string' && a.title.trim() !== '' ? `「${a.title}」` : ''
      const series = countSeries(option)
      return `Rendered ECharts chart${title}${series > 0 ? ` (${series} series)` : ''}. The user now sees the interactive chart card.`
    },
  }
}

export function apply(ctx, config = {}) {
  ctx.systemPrompt.section({
    name: 'artifact:render',
    order: 106,
    text: SYSTEM_PROMPT_TEXT,
  })
  try {
    ctx.tools.register(createRenderArtifactTool())
    console.log(`[${PKG}] registered ${TOOL_NAME} tool + system-prompt section`)
  } catch (error) {
    console.error(`[${PKG}] ${TOOL_NAME} registration failed:`, error?.message ?? error)
  }
  // The webServer service only exists under the web profile; this cordis line
  // has no optional-inject form, so the asset route rides a scoped ctx.inject:
  // the closure runs when the service appears and never runs where it does not
  // (headless stays untouched).
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      try {
        scope.webServer.register({ kind: 'prefix', path: ASSET_ROUTE_PATH, handler: serveAsset })
        console.log(`[${PKG}] asset route ready at ${ASSET_ROUTE_PATH}`)
      } catch (error) {
        console.error(`[${PKG}] asset route skipped:`, error?.message ?? error)
      }
    })
  }
}
