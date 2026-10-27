/// <reference types="vite/client" />

/**
 * 渲染进程全局类型声明。
 *
 * 这里仅以类型方式引用预加载脚本的契约（import type 会被完全擦除），
 * 不会把 electron 或其运行时依赖打进渲染进程产物。
 */
import type { DesktopBridge } from '../../preload/index'

declare global {
  interface Window {
    /** 由 src/preload/index.ts 经 contextBridge 注入；在纯浏览器中预览渲染层时为 undefined。 */
    readonly desktop?: DesktopBridge
  }
}
