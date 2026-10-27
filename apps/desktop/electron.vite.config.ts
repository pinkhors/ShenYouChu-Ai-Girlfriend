import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/**
 * 三段式构建配置：主进程、预加载脚本、渲染进程分别产出到 out/main、out/preload、out/renderer。
 * 渲染进程 root 指向 src/renderer，因此 index.html 与该目录下的 /src/main.tsx 为入口。
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          /**
           * package.json 为 "type": "module"，.js 会被当作 ESM；
           * 而 Electron 在 sandbox: true 的渲染进程中不支持 ESM 预加载脚本，
           * 因此预加载显式构建为 CJS 并落盘为 .cjs（主进程按该文件名加载）。
           */
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      /* outDir 在 root 之外，需要显式允许清空，避免旧产物残留 */
      emptyOutDir: true
    }
  }
})
