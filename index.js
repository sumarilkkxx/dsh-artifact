// dsh-artifact — DeepSeek Harness host half (v0.2).
//
// Registers two model-facing tools:
//   - `render_artifact` — renders a chart / diagram / 3D scene inline from a
//     declarative payload, dispatched by `engine` (echarts | mermaid | three).
//   - `render_html` — renders arbitrary custom HTML/CSS/JS as a sandboxed
//     inline widget (browser half wraps it in a sandboxed iframe + CSP).
//
// Both are registered as raw JSON-Schema definitions (zero `@deepseek-ai/*`
// runtime imports) — out-of-tree resolution of @deepseek-ai/dsh-tools is not
// reliable on the developer-preview line, so this half owns its validation.
// The ECharts / Mermaid / Three engine assets are served lazily from a
// self-registered route under /plugins/dsh-artifact/assets/*.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const PKG = 'dsh-artifact'
const TOOL_NAME = 'render_artifact'
const HTML_TOOL_NAME = 'render_html'
const ASSET_ROUTE_PATH = `/plugins/${PKG}/assets`

// Safe flat file names only: no slashes, no traversal, .js assets only.
const ASSET_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/

// Payload size caps (serialized bytes) — bounded context + memory.
const OPTION_MAX_BYTES = 1_000_000
const CODE_MAX_BYTES = 100_000
const SPEC_MAX_BYTES = 100_000
const HTML_MAX_BYTES = 1_000_000

export const name = PKG
export const inject = ['systemPrompt', 'tools', 'skills']

// Short, trigger-focused system-prompt section. Detailed payload formats and
// examples live in the bundled skill (progressive disclosure), keeping the
// always-on context lean.
const SYSTEM_PROMPT_TEXT = `You can render rich interactive content INLINE in the conversation with two tools: ${TOOL_NAME} (charts / diagrams / 3D scenes) and ${HTML_TOOL_NAME} (sandboxed custom HTML widgets).

TRIGGER (must follow): whenever the user asks for ANY chart, plot, diagram, visualization, 3D scene, or interactive widget — e.g. "画一张柱状图/折线图/饼图", "做个流程图", "画个3D场景", "做一个交互组件" — you MUST call ${TOOL_NAME} (or ${HTML_TOOL_NAME} for arbitrary custom HTML), even when the user does not name the tool. Do not answer with prose or a Markdown table when a chart / diagram / 3D / widget is the better representation. The "dsh-artifact" skill carries the detailed payload formats and examples.`

// Bundled skill: progressive disclosure of the detailed payload formats, so the
// always-on system-prompt stays short while the model can load full guidance
// on demand when a user's intent matches.
const SKILL_NAME = 'dsh-artifact'
const SKILL_DESCRIPTION = '用 render_artifact 渲染图表/流程图/3D 场景，用 render_html 渲染沙箱化自定义 HTML 组件。'
const SKILL_WHEN_TO_USE = '当用户要求任何图表、绘图、可视化、流程图、3D 场景或交互组件（如「画一张柱状图/折线图/饼图」「做个流程图」「画个3D」「做一个计数器」），即使没有点名工具，也要主动调用 render_artifact 或 render_html，而不是用文字或 Markdown 表格回答。'
const SKILL_CONTENT = `# dsh-artifact 渲染指南

当用户想要图表、流程图、3D 场景或自定义交互组件时，用下面的工具渲染，不要用文字或 Markdown 表格代替。

## render_artifact（图表 / 流程图 / 3D）

按 \`engine\` 选择引擎并填入对应字段：

### echarts（图表，最常用）
\`{"engine":"echarts","option":{...}}\`
- \`option\` 是纯 JSON 的 ECharts 配置，**禁止函数**（formatter 用字符串模板，如 "{c}%"）。
- 支持全部图表类型：bar / line / pie / scatter / heatmap / radar / gauge / funnel / sankey / graph / map / boxplot / sunburst 等。
- 示例（季度收入柱状图）：
\`\`\`json
{"engine":"echarts","title":"季度收入","option":{"title":{"text":"季度收入（万元）"},"xAxis":{"type":"category","data":["Q1","Q2","Q3","Q4"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[120,180,150,210]}]}}
\`\`\`

### mermaid（流程图 / 图）
\`{"engine":"mermaid","code":"flowchart TD; A-->B;"}\`
- \`code\` 是 Mermaid 图源码：flowchart / sequenceDiagram / classDiagram / gantt / stateDiagram / pie / erDiagram / journey。

### three（3D 场景）
\`{"engine":"three","spec":{"meshes":[{"shape":"box","color":"#4d6bfe","size":1}],"background":"#16213a"}}\`
- \`shape\` 白名单：box / sphere / cone / cylinder / torus。

## render_html（自定义交互组件）

当声明式引擎表达不了时，渲染任意 HTML/CSS/JS：
\`{"html":"<button onclick=\\"this.textContent='clicked'\\">click</button>"}\`
- \`html\` 是自包含的 HTML 片段或完整文档；运行在沙箱 iframe 中（无网络、无顶层导航、无表单提交）。

## 规则

- 一次调用一个产物；payload 必须是纯 JSON（mermaid code 是普通字符串）。
- \`option\` / \`spec\` 必须是 JSON 对象，不要传序列化字符串。
- 结构化数据用图表、流程用 mermaid、几何预览用 three、自定义交互用 render_html。
- 拿不准就选 echarts。`

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
      'cache-control': 'public, max-age=31536000, immutable',
    })
    res.end(body)
  } catch {
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

/** Recursively reject values JSON cannot faithfully carry. */
function isJsonSafe(value, depth) {
  if (depth > 128) return false
  if (value === null) return true
  const t = typeof value
  if (t === 'function' || t === 'undefined' || t === 'symbol' || t === 'bigint') return false
  if (t === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every((v) => isJsonSafe(v, depth + 1))
  if (t === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return false
    return Object.keys(value).every((k) => isJsonSafe(value[k], depth + 1))
  }
  return true
}

/** Byte size of a value's JSON serialization (or -1 if it cannot serialize). */
function jsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return -1
  }
}

/** Whether an object carries any render_artifact / render_html argument field. */
function isArgsShaped(obj) {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
    ('option' in obj || 'code' in obj || 'spec' in obj || 'html' in obj || 'engine' in obj)
}

/**
 * Unwrap the tool-call bridge's argument shapes. The bridge has been observed
 * to deliver arguments as `{field:<object>}`, `{field:"<json>"}`, or the
 * double-encoded `{arguments:"<json>"}` / `{arguments:<object>}` wrappers.
 * A bare string is either the whole args object serialized, or a bare payload
 * (e.g. an ECharts option) serialized: parse it, recurse only when it recovers
 * an args-shaped object, and otherwise treat it as `option`.
 */
function unwrapArgs(args) {
  if (typeof args === 'string') {
    const parsed = parseJson(args)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return isArgsShaped(parsed) ? unwrapArgs(parsed) : { option: parsed }
    }
    return { option: args }
  }
  if (typeof args !== 'object' || args === null) return {}
  if (isArgsShaped(args)) return args
  if ('arguments' in args) {
    const a = args.arguments
    if (typeof a === 'string') {
      const parsed = parseJson(a)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return isArgsShaped(parsed) ? unwrapArgs(parsed) : { option: parsed }
      }
      return { option: a }
    }
    if (a && typeof a === 'object') return unwrapArgs(a)
  }
  return args
}

/** Normalize an object-or-stringified-object payload to a plain object. */
function normalizeObjectPayload(raw) {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'string') return parseJson(raw)
  return typeof raw === 'object' && !Array.isArray(raw) ? raw : undefined
}

function cardTitle(title) {
  return typeof title === 'string' && title.trim() !== '' ? title : TOOL_NAME
}

/** Resolve the render_artifact meta persisted onto the tool result (pure). */
function resolveMeta(args) {
  const a = unwrapArgs(args)
  const engine = a.engine === 'mermaid' || a.engine === 'three' ? a.engine : 'echarts'
  const title = typeof a.title === 'string' ? a.title : undefined
  const height = typeof a.height === 'number' ? a.height : 360
  let payload
  if (engine === 'mermaid') payload = typeof a.code === 'string' ? a.code : undefined
  else if (engine === 'three') payload = normalizeObjectPayload(a.spec)
  else payload = normalizeObjectPayload(a.option)
  // Defensive: never let non-JSON values (e.g. BigInt) into the persisted meta.
  if (payload !== undefined && !isJsonSafe(payload, 0)) payload = undefined
  return { engine, payload, title, height }
}

/** Validate an ECharts option; returns a message on failure, else null. */
function checkEcharts(option) {
  if (option === undefined || option === null || typeof option !== 'object' || Array.isArray(option)) {
    return `${TOOL_NAME}: "option" must be a JSON object (not a string/array).`
  }
  if (!isJsonSafe(option, 0)) {
    return `${TOOL_NAME}: "option" contains non-JSON values (functions, BigInt, NaN/Infinity, or non-plain objects). Use ECharts string templates for formatters instead of functions.`
  }
  const bytes = jsonBytes(option)
  if (bytes < 0) {
    return `${TOOL_NAME}: "option" is not JSON-serializable (contains values JSON cannot carry, e.g. BigInt).`
  }
  if (bytes > OPTION_MAX_BYTES) {
    return `${TOOL_NAME}: "option" is too large (${bytes} bytes over the ${OPTION_MAX_BYTES}-byte cap).`
  }
  return null
}

/** Validate a Mermaid diagram source; returns a message on failure, else null. */
function checkMermaid(code) {
  if (typeof code !== 'string' || code.trim() === '') {
    return `${TOOL_NAME}: "code" must be a non-empty Mermaid diagram source string (engine=mermaid).`
  }
  if (Buffer.byteLength(code, 'utf8') > CODE_MAX_BYTES) {
    return `${TOOL_NAME}: "code" is too large (over the ${CODE_MAX_BYTES}-byte cap).`
  }
  return null
}

/** Validate a three.js scene spec; returns a message on failure, else null. */
function checkThree(spec) {
  if (spec === undefined || spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    return `${TOOL_NAME}: "spec" must be a JSON object (engine=three), e.g. {"meshes":[...]}.`
  }
  if (!isJsonSafe(spec, 0)) {
    return `${TOOL_NAME}: "spec" contains non-JSON values (functions, BigInt, NaN/Infinity, or non-plain objects).`
  }
  if (!Array.isArray(spec.meshes) || spec.meshes.length === 0) {
    return `${TOOL_NAME}: "spec" needs a non-empty "meshes" array.`
  }
  const specBytes = jsonBytes(spec)
  if (specBytes < 0) {
    return `${TOOL_NAME}: "spec" is not JSON-serializable (contains values JSON cannot carry, e.g. BigInt).`
  }
  if (specBytes > SPEC_MAX_BYTES) {
    return `${TOOL_NAME}: "spec" is too large (over the ${SPEC_MAX_BYTES}-byte cap).`
  }
  return null
}

function engineLabel(engine) {
  if (engine === 'mermaid') return 'Mermaid diagram'
  if (engine === 'three') return '3D scene'
  return 'ECharts chart'
}

/** Build the raw `render_artifact` tool definition (multi-engine). */
function createRenderArtifactTool() {
  return {
    name: TOOL_NAME,
    description:
      'Render a chart, diagram, or 3D scene inline in the conversation as an interactive card. '
      + 'TRIGGER: use whenever the user asks for any chart / plot / diagram / visualization / 3D preview (画图 / 图表 / 可视化 / 流程图 / 3D / 组件), even without naming this tool. '
      + 'Pick an engine and pass the matching field: '
      + 'engine="echarts" with `option` (plain-JSON ECharts option, no functions — use string templates like "{c}%" for formatters; every ECharts chart type works); '
      + 'engine="mermaid" with `code` (Mermaid diagram source: flowchart/sequenceDiagram/classDiagram/gantt/stateDiagram/pie/erDiagram/journey); '
      + 'engine="three" with `spec` (declarative 3D scene: {"meshes":[{"shape":"box|sphere|cone|cylinder|torus","color":"#hex","size":n,"position":[x,y,z],"rotation":[rx,ry,rz]}],"background":"#hex","ambient":n}). '
      + 'Do not answer with prose or a Markdown table when a chart / diagram / 3D preview is the better representation.',
    parameters: {
      type: 'object',
      properties: {
        engine: {
          type: 'string',
          enum: ['echarts', 'mermaid', 'three'],
          description: 'Rendering engine. Defaults to "echarts".',
        },
        option: {
          oneOf: [
            { type: 'object', description: 'The ECharts option as a plain JSON object.' },
            { type: 'string', description: 'The ECharts option serialized as a JSON string.' },
          ],
          description: 'ECharts chart option (engine=echarts). Plain JSON, no functions.',
        },
        code: {
          type: 'string',
          description: 'Mermaid diagram source (engine=mermaid): flowchart, sequenceDiagram, classDiagram, gantt, stateDiagram, pie, erDiagram, journey.',
        },
        spec: {
          oneOf: [
            { type: 'object', description: 'The three.js scene spec as a plain JSON object.' },
            { type: 'string', description: 'The three.js scene spec serialized as a JSON string.' },
          ],
          description: 'Declarative 3D scene (engine=three): {"meshes":[{shape,color,size,position,rotation}],"background","ambient"}.',
        },
        title: { type: 'string', description: 'Optional card title.' },
        height: { type: 'number', description: 'Optional height in px (default 360, min 120).' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string', description: 'One-line human-readable render summary.' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
      presentationMeta: (args) => resolveMeta(args),
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: cardTitle(args?.title) }),
    presentResult: (args) => ({ card: 'generic', title: cardTitle(args?.title) }),
    async execute(args) {
      const a = unwrapArgs(args)
      const engine = a.engine === 'mermaid' || a.engine === 'three' ? a.engine : 'echarts'
      const title = typeof a.title === 'string' && a.title.trim() !== '' ? `「${a.title}」` : ''
      if (engine === 'mermaid') {
        const code = a.code
        const err = checkMermaid(code)
        if (err) return err
        return `Rendered Mermaid diagram${title}. The user now sees the interactive diagram card.`
      }
      if (engine === 'three') {
        const spec = normalizeObjectPayload(a.spec)
        const err = checkThree(spec)
        if (err) return err
        return `Rendered 3D scene${title} (${spec.meshes.length} meshes). The user now sees the interactive 3D card.`
      }
      const option = normalizeObjectPayload(a.option)
      const err = checkEcharts(option)
      if (err) return err
      const series = Array.isArray(option.series) ? option.series.length : 0
      return `Rendered ECharts chart${title}${series > 0 ? ` (${series} series)` : ''}. The user now sees the interactive chart card.`
    },
  }
}

/** Resolve the render_html meta persisted onto the tool result (pure). */
function resolveHtmlMeta(args) {
  const a = unwrapArgs(args)
  return {
    html: typeof a.html === 'string' ? a.html : undefined,
    title: typeof a.title === 'string' ? a.title : undefined,
    height: typeof a.height === 'number' ? a.height : 400,
  }
}

/** Build the raw `render_html` tool definition (sandboxed custom widget). */
function createRenderHtmlTool() {
  return {
    name: HTML_TOOL_NAME,
    description:
      'Render arbitrary custom HTML/CSS/JS as a sandboxed inline widget in the conversation. '
      + 'TRIGGER: use whenever the user asks for a custom interactive widget / UI mockup / calculator (交互组件 / 自定义组件 / 小工具) that the declarative engines cannot express. '
      + 'Pass `html` — a self-contained HTML fragment or full document. The widget runs in a sandboxed iframe: no network, no top navigation, no form submission; inline scripts and styles are allowed. '
      + 'Keep it self-contained (no external resources).',
    parameters: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'Self-contained HTML content (fragment or full document). Inline scripts/styles allowed; external resources blocked.',
        },
        title: { type: 'string', description: 'Optional card title.' },
        height: { type: 'number', description: 'Optional widget height in px (default 400, min 120).' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string', description: 'One-line human-readable render summary.' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
      presentationMeta: (args) => resolveHtmlMeta(args),
    },
    isConcurrencySafe: () => true,
    presentCall: (args) => ({ card: 'generic', title: typeof args?.title === 'string' ? args.title : HTML_TOOL_NAME }),
    presentResult: (args) => ({ card: 'generic', title: typeof args?.title === 'string' ? args.title : HTML_TOOL_NAME }),
    async execute(args) {
      const a = unwrapArgs(args)
      const html = a.html
      if (typeof html !== 'string' || html.trim() === '') {
        return `${HTML_TOOL_NAME}: missing "html" — pass a self-contained HTML string.`
      }
      const bytes = Buffer.byteLength(html, 'utf8')
      if (bytes > HTML_MAX_BYTES) {
        return `${HTML_TOOL_NAME}: "html" is too large (${bytes} bytes over the ${HTML_MAX_BYTES}-byte cap).`
      }
      const title = typeof a.title === 'string' && a.title.trim() !== '' ? `「${a.title}」` : ''
      return `Rendered HTML widget${title} (${bytes} bytes) in a sandboxed iframe. The user now sees the interactive widget.`
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
    ctx.skills.register({
      name: SKILL_NAME,
      description: SKILL_DESCRIPTION,
      whenToUse: SKILL_WHEN_TO_USE,
      source: 'bundled',
      content: SKILL_CONTENT,
    })
  } catch (error) {
    console.error(`[${PKG}] skill registration failed:`, error?.message ?? error)
  }
  try {
    ctx.tools.register(createRenderArtifactTool())
    ctx.tools.register(createRenderHtmlTool())
    console.log(`[${PKG}] registered ${TOOL_NAME} + ${HTML_TOOL_NAME} tools + skill + system-prompt section`)
  } catch (error) {
    console.error(`[${PKG}] tool registration failed:`, error?.message ?? error)
  }
  // The webServer service only exists under the web profile; this cordis line
  // has no optional-inject form, so the asset route rides a scoped ctx.inject.
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
