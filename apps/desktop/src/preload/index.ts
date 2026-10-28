import { contextBridge, ipcRenderer } from 'electron'
import type { ImageGenerationRequest } from '../main/imagegen'

/**
 * 预加载脚本：只向渲染进程暴露非敏感的宿主信息与一个受控的出图通道。
 *
 * 约束：禁止在此暴露 token、密钥、文件系统或任意 IPC 通道；
 * 渲染进程所需的业务数据一律走后端 REST 接口（见 src/renderer/src/api/client.ts）。
 */

/** 本地开发默认地址：services/core 的 SERVER_PORT 默认 48080。 */
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:48080'

/** window.desktop 的契约，由渲染进程以类型方式引用（src/renderer/src/env.d.ts）。 */
export interface DesktopBridge {
  readonly platform: string
  readonly apiBaseUrl: string
  /** 出图请求走主进程，避免渲染进程 CORS 并让密钥不进入页面代码。 */
  readonly imagegen: {
    generate(request: ImageGenerationRequest): Promise<string>
  }
}

/** 优先取进程环境变量，便于指向局域网或远端后端；缺失时回落到本地默认地址。 */
function resolveApiBaseUrl(): string {
  const fromEnv = process.env.VITE_API_BASE_URL
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv.trim()
  }
  return DEFAULT_API_BASE_URL
}

const bridge: DesktopBridge = Object.freeze({
  platform: process.platform,
  apiBaseUrl: resolveApiBaseUrl(),
  imagegen: Object.freeze({
    generate: (request: ImageGenerationRequest): Promise<string> =>
      ipcRenderer.invoke('imagegen:generate', request) as Promise<string>
  })
})

contextBridge.exposeInMainWorld('desktop', bridge)

/*
 * 待办（后续里程碑，本骨架不实现）：
 * - TODO(M1 语音)：如音频设备枚举必须走主进程，在此补最小权限的 IPC 白名单；
 * - TODO(M3 安全存储)：凭证读写改为“主进程 safeStorage + 受限 IPC”，渲染进程只拿短时内存态。
 */
