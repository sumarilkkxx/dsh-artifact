// dsh-artifact build: copy the ECharts UMD distribution into assets/ so the
// host half can serve it as a lazy on-demand engine. The plugin ships the
// copied asset; echarts itself is a build-time (dev) dependency only.
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules', 'echarts', 'dist', 'echarts.min.js')
const destDir = resolve(root, 'assets')
const dest = resolve(destDir, 'echarts.min.js')

await mkdir(destDir, { recursive: true })
await copyFile(src, dest)
console.log(`[dsh-artifact] copied echarts.min.js -> assets/echarts.min.js`)
