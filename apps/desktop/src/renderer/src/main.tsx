import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

/** 渲染进程入口：只负责挂载根组件，业务状态在 App 内管理。 */
const container = document.getElementById('root')

if (container === null) {
  /* 挂载点缺失属于打包/模板错误，直接失败比静默白屏更易定位 */
  throw new Error('未找到 #root 挂载节点，请检查 src/renderer/index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
