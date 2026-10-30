package com.shenyouchu.core.memory;

/**
 * 记忆删除的派生数据清理端口：把「用户删掉一条记忆」传播到星图的 chunk 与召回记录。
 *
 * <p>用户删除（{@code DELETE /memories/{id}}）语义是**真删**（docs/20 §7.5 `forgotten`）：
 * 派生的 chunk 与 recall 记录物理移除，星图节点随之消失。
 * 它与星图上的「忘记」（写 {@code invalid_at}、保留幽灵星）是两件事，不可混用。
 *
 * <p>实现放在 `memorygraph` 包；本接口定义在 `memory` 包，使依赖方向保持
 * {@code memorygraph → memory} 单向，避免包级循环。
 */
public interface MemoryForgetPort {

    /**
     * 按来源消息删除派生 chunk 与召回记录。
     *
     * @param userId          记忆归属者；实现方必须用它做归属校验，不得只按消息 id 删除
     * @param sourceMessageId `memories.source_message_id`，即该轮用户消息 id
     * @return 实际删除的 chunk 数（用于日志与断言；不存在时为 0，不视为错误）
     */
    int deleteBySourceMessage(Long userId, Long sourceMessageId);
}
