package com.shenyouchu.core.memorygraph;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.memory.MemoryForgetPort;
import com.shenyouchu.core.memorygraph.mapper.MemoryChunkMapper;
import com.shenyouchu.core.memorygraph.mapper.MemoryEdgeMapper;
import com.shenyouchu.core.memorygraph.mapper.MemoryRecallEventMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 把「用户删除记忆」传播到星图的派生数据（docs/20 §7.5 的 {@code forgotten} 语义）。
 *
 * <p>删除范围（全部按 {@code user_id} 限定，防止跨用户误删）：
 * <ol>
 *   <li>该轮 chunk（按 user_message_id 或 assistant_message_id 命中）；</li>
 *   <li>引用这些 chunk 的 {@code memory_edges}（表上已有 ON DELETE CASCADE，
 *       这里显式删是为了在关闭外键或分库时行为一致）；</li>
 *   <li>引用这些 chunk 的 {@code memory_recall_events}；</li>
 *   <li>受影响角色的星图快照重建，使节点立刻从图上消失。</li>
 * </ol>
 *
 * <p>与「忘记」的区别：{@code MemoryGraphService.forget} 只写 {@code invalid_at}，
 * 节点变幽灵星、仍留在图上；本类是**真删**，节点直接消失。两者不可互相替代。
 */
@Component
public class MemoryChunkForgetAdapter implements MemoryForgetPort {

    private static final Logger log = LoggerFactory.getLogger(MemoryChunkForgetAdapter.class);

    private final MemoryChunkMapper chunkMapper;
    private final MemoryEdgeMapper edgeMapper;
    private final MemoryRecallEventMapper recallEventMapper;
    private final MemoryGraphService graphService;

    public MemoryChunkForgetAdapter(MemoryChunkMapper chunkMapper,
                                    MemoryEdgeMapper edgeMapper,
                                    MemoryRecallEventMapper recallEventMapper,
                                    MemoryGraphService graphService) {
        this.chunkMapper = chunkMapper;
        this.edgeMapper = edgeMapper;
        this.recallEventMapper = recallEventMapper;
        this.graphService = graphService;
    }

    @Override
    @Transactional
    public int deleteBySourceMessage(Long userId, Long sourceMessageId) {
        if (userId == null || sourceMessageId == null) {
            return 0;
        }
        List<MemoryChunk> chunks = chunkMapper.selectList(Wrappers.<MemoryChunk>lambdaQuery()
                .eq(MemoryChunk::getUserId, userId)
                .and(wrapper -> wrapper
                        .eq(MemoryChunk::getUserMessageId, sourceMessageId)
                        .or()
                        .eq(MemoryChunk::getAssistantMessageId, sourceMessageId)));
        if (chunks == null || chunks.isEmpty()) {
            log.debug("删除记忆时未找到对应 chunk user={} message={}", userId, sourceMessageId);
            return 0;
        }

        List<Long> chunkIds = new ArrayList<>(chunks.size());
        Set<Long> characterIds = new LinkedHashSet<>();
        for (MemoryChunk chunk : chunks) {
            chunkIds.add(chunk.getId());
            if (chunk.getCharacterId() != null) {
                characterIds.add(chunk.getCharacterId());
            }
        }

        /* 先删引用方，再删 chunk：不依赖数据库外键级联是否开启 */
        edgeMapper.delete(Wrappers.<MemoryEdge>lambdaQuery()
                .eq(MemoryEdge::getUserId, userId)
                .and(wrapper -> wrapper
                        .in(MemoryEdge::getSourceChunkId, chunkIds)
                        .or()
                        .in(MemoryEdge::getTargetChunkId, chunkIds)));
        recallEventMapper.delete(Wrappers.<MemoryRecallEvent>lambdaQuery()
                .eq(MemoryRecallEvent::getUserId, userId)
                .in(MemoryRecallEvent::getChunkId, chunkIds));

        int deleted = chunkMapper.delete(Wrappers.<MemoryChunk>lambdaQuery()
                .eq(MemoryChunk::getUserId, userId)
                .in(MemoryChunk::getId, chunkIds));
        log.info("删除记忆的派生 chunk user={} message={} chunks={} edgesRecallCleared=true",
                userId, sourceMessageId, deleted);

        /* 快照重建失败不影响删除本身（与 MemoryGraphService.refreshIncremental 同策略） */
        for (Long characterId : characterIds) {
            graphService.refreshIncremental(userId, characterId);
        }
        return deleted;
    }
}
