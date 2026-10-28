import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * npm run dev 的包装：清掉会把 Electron 变成 Node 的 ELECTRON_RUN_AS_NODE。
 * 某些 IDE / 终端会全局注入它，导致 `electron-vite dev` 只打印
 * "start electron app..." 却不创建窗口。
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const cli = join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

const env = { ...process.env }
if (env.ELECTRON_RUN_AS_NODE !== undefined) {
  delete env.ELECTRON_RUN_AS_NODE
  console.log('[dev] cleared ELECTRON_RUN_AS_NODE so Electron can open a window')
}

const args = process.argv.slice(2)
const child = spawn(process.execPath, [cli, ...(args.length === 0 ? ['dev'] : args)], {
  cwd: root,
  env,
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error('[dev] failed to start electron-vite:', error)
  process.exit(1)
})

const forward = (signal) => {
  if (!child.killed) {
    child.kill(signal)
  }
}
process.on('SIGINT', () => forward('SIGINT'))
process.on('SIGTERM', () => forward('SIGTERM'))

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
