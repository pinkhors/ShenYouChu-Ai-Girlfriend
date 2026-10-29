import { cancelTurn, streamTurn } from '../api/client'
import { createTurnSessionStore } from './turnSessionStore'

/**
 * 回合状态仓库的组合根：把真实网络实现注入纯逻辑 store。
 *
 * 这是 `chat/` 下唯一 import `api/client` 的文件（客户端模块使用 `import.meta`，
 * 不能进入 CommonJS 测试工程）；store 本身保持零客户端依赖，测试直接注入假实现。
 */
export const turnSessions = createTurnSessionStore({
  stream: (conversationId, text, handlers, signal) =>
    streamTurn(conversationId, text, handlers, signal),
  cancel: (conversationId, turnId) => cancelTurn(conversationId, turnId)
})

/** 读取指定会话的回合快照（可直接作为 useSyncExternalStore 的 getSnapshot）。 */
export const getTurnSession = turnSessions.getSession

/** 订阅回合状态变化。 */
export const subscribeTurnSessions = turnSessions.subscribe

/** 订阅“某会话的一轮已结束”。 */
export const subscribeSettledTurns = turnSessions.subscribeSettled

/** 发起一轮（同会话已在发送时忽略）。 */
export const startTurn = turnSessions.startTurn

/** 停止该会话进行中的回合。 */
export const stopTurn = turnSessions.stopTurn

/** 界面回源对齐后清空已结束回合的残留。 */
export const clearSettledTurn = turnSessions.clearSettledTurn

/** 界面已把失败文本回填到输入框，清除标记避免重复回填。 */
export const consumeFailedText = turnSessions.consumeFailedText

/** 清空全部回合状态与占位消息（退出登录 / 401 / 删除账号）。 */
export const resetTurnSessions = turnSessions.reset
