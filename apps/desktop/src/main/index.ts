import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

/**
 * 主进程入口。
 *
 * 安全基线：contextIsolation 开启、nodeIntegration 关闭、sandbox 开启；
 * 渲染进程只能通过 src/preload/index.ts 暴露的只读桥接访问宿主能力。
 *
 * 待办（后续里程碑，本骨架不实现）：
 * - TODO(M1 语音)：注册 ASR/TTS 相关 IPC 与音频设备权限处理；
 * - TODO(M2 视觉)：处理摄像头授权与本地推理进程的通道隔离；
 * - TODO(M3 安全存储)：用 safeStorage 在主进程读写凭证，替代渲染进程 localStorage。
 */

const WINDOW_WIDTH = 1280
const WINDOW_HEIGHT = 800

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#12131a',
    webPreferences: {
      /* 预加载产物为 CJS（见 electron.vite.config.ts 中 preload 的 output 配置） */
      preload: join(app.getAppPath(), 'out', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  /* 先隐藏、渲染就绪后再显示，避免白屏闪烁 */
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  /* 外部链接交给系统浏览器，不在应用窗口内打开未知页面 */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererDevServerUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererDevServerUrl !== undefined && rendererDevServerUrl !== '') {
    /**
     * 统一走 IPv4：Windows 下 localhost 可能解析为 ::1，
     * 而开发服务器绑定在 127.0.0.1，直接加载 localhost 会 ERR_CONNECTION_REFUSED。
     * 同时把网络/证书错误映射为窗口内错误提示，避免静默白屏或系统错误页。
     */
    const normalizedUrl = rendererDevServerUrl.replace('://localhost', '://127.0.0.1')
    void mainWindow.loadURL(normalizedUrl).catch((error: unknown) => {
      console.error('[desktop] 开发服务器加载失败：', error)
      void mainWindow.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<h2 style="font-family:sans-serif;color:#e8e8ea;background:#12131a;padding:24px">' +
              '开发服务器加载失败</h2>' +
              '<p style="font-family:sans-serif;color:#c8c9ce;background:#12131a;padding:0 24px 24px">' +
              `目标地址：${normalizedUrl}</p>`
          )
      )
    })
  } else {
    /* 生产/预览：使用 app.getAppPath() 而非 __dirname，因为主进程产物是 ESM */
    void mainWindow.loadFile(join(app.getAppPath(), 'out', 'renderer', 'index.html'))
  }

  return mainWindow
}

void app.whenReady().then(() => {
  createMainWindow()

  /* macOS：点击 Dock 图标且无窗口时重新创建 */
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  /* macOS 之外的平台在全部窗口关闭后退出 */
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
