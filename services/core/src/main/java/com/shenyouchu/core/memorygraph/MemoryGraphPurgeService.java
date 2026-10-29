package com.shenyouchu.core.memorygraph;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.memorygraph.mapper.MemoryChunkMapper;
import com.shenyouchu.core.memorygraph.mapper.MemoryEdgeMapper;
import com.shenyouchu.core.memorygraph.mapper.MemoryGraphSnapshotMapper;
import com.shenyouchu.core.memorygraph.mapper.MemoryRecallEventMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 记忆星图的删除矩阵：账号删除、清空会话时清理派生数据。
 *
 * <p>角色“彻底删除”走 characters 硬删除，外键 ON DELETE CASCADE 会物理清理；
 * 账号与消息是逻辑删除，因此必须显式清理，否则会留下孤立的 chunk/快照。
 */
@Service
public class MemoryGraphPurgeService {

    private final MemoryChunkMapper chunkMapper;
    private final MemoryEdgeMapper edgeMapper;
    private final MemoryRecallEventMapper recallMapper;
    private final MemoryGraphSnapshotMapper snapshotMapper;

    public MemoryGraphPurgeService(MemoryChunkMapper chunkMapper,
                                   MemoryEdgeMapper edgeMapper,
                                   MemoryRecallEventMapper recallMapper,
                                   MemoryGraphSnapshotMapper snapshotMapper) {
        this.chunkMapper = chunkMapper;
        this.edgeMapper = edgeMapper;
        this.recallMapper = recallMapper;
        this.snapshotMapper = snapshotMapper;
    }

    @Transactional
    public void purgeUser(Long userId) {
        edgeMapper.delete(Wrappers.<MemoryEdge>lambdaQuery().eq(MemoryEdge::getUserId, userId));
        recallMapper.delete(Wrappers.<MemoryRecallEvent>lambdaQuery().eq(MemoryRecallEvent::getUserId, userId));
        snapshotMapper.delete(Wrappers.<MemoryGraphSnapshot>lambdaQuery().eq(MemoryGraphSnapshot::getUserId, userId));
        chunkMapper.delete(Wrappers.<MemoryChunk>lambdaQuery().eq(MemoryChunk::getUserId, userId));
    }

    /** 清空聊天记录：chunk 逻辑删除；边与快照整用户失效，下次读取时按剩余 chunk 重建。 */
    @Transactional
    public void purgeConversation(Long userId, Long conversationId) {
        chunkMapper.delete(Wrappers.<MemoryChunk>lambdaQuery()
                .eq(MemoryChunk::getUserId, userId)
                .eq(MemoryChunk::getConversationId, conversationId));
        edgeMapper.delete(Wrappers.<MemoryEdge>lambdaQuery().eq(MemoryEdge::getUserId, userId));
        snapshotMapper.delete(Wrappers.<MemoryGraphSnapshot>lambdaQuery().eq(MemoryGraphSnapshot::getUserId, userId));
    }
}
