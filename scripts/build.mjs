// dsh-artifact build: copy the ECharts / ECharts-GL / Mermaid UMD distributions into
// assets/ so the host half can serve them as lazy on-demand engines. The plugin
// ships the copied assets; the engines themselves are build-time (dev)
// dependencies only.
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destDir = resolve(root, 'assets')
await mkdir(destDir, { recursive: true })

const engines = [
  ['echarts', 'echarts/dist/echarts.min.js', 'echarts.min.js'],
  ['echarts-gl', 'echarts-gl/dist/echarts-gl.min.js', 'echarts-gl.min.js'],
  ['mermaid', 'mermaid/dist/mermaid.min.js', 'mermaid.min.js'],
]

for (const [name, srcRel, out] of engines) {
  const src = resolve(root, 'node_modules', srcRel)
  const dest = resolve(destDir, out)
  await copyFile(src, dest)
  console.log(`[dsh-artifact] copied ${name} -> assets/${out}`)
}
