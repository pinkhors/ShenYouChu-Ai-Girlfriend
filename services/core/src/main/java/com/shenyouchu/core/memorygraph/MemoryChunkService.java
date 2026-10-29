package com.shenyouchu.core.memorygraph;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.memorygraph.embedding.EmbeddingPort;
import com.shenyouchu.core.memorygraph.embedding.EmbeddingService;
import com.shenyouchu.core.memorygraph.mapper.MemoryChunkMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

/**
 * 记忆写入：一轮对话一个 chunk，生成话题/实体/分类/向量，然后增量刷新星图。
 *
 * <p>幂等键 (user_id, turn_id)；重复调用直接返回。失败只记日志，不影响对话。
 */
@Service
public class MemoryChunkService {

    private static final Logger log = LoggerFactory.getLogger(MemoryChunkService.class);

    private final MemoryChunkMapper chunkMapper;
    private final EmbeddingService embeddingService;
    private final MemoryGraphService graphService;
    private final ObjectMapper objectMapper;

    public MemoryChunkService(MemoryChunkMapper chunkMapper,
                              EmbeddingService embeddingService,
                              MemoryGraphService graphService,
                              ObjectMapper objectMapper) {
        this.chunkMapper = chunkMapper;
        this.embeddingService = embeddingService;
        this.graphService = graphService;
        this.objectMapper = objectMapper;
    }

    /** 对话入库路径：写 chunk 后立即增量刷新星图。 */
    public void recordTurn(Long userId, Long characterId, Long conversationId, String turnId,
                           Long userMessageId, String userText,
                           Long assistantMessageId, String assistantText) {
        recordTurn(userId, characterId, conversationId, turnId, userMessageId, userText,
                assistantMessageId, assistantText, true);
    }

    /**
     * 写一轮 chunk；{@code refreshGraph=false} 供历史回填使用——回填完成后再统一重建一次，
     * 避免每一轮都重算整张图。除刷新时机外，其余语义与默认方法完全一致。
     */
    public void recordTurn(Long userId, Long characterId, Long conversationId, String turnId,
                           Long userMessageId, String userText,
                           Long assistantMessageId, String assistantText,
                           boolean refreshGraph) {
        if (userId == null || characterId == null || conversationId == null
                || turnId == null || turnId.isBlank()) {
            return;
        }
        if (exists(userId, turnId)) {
            return;
        }
        String user = userText == null ? "" : userText.trim();
        String assistant = assistantText == null ? "" : assistantText.trim();
        if (user.isEmpty() && assistant.isEmpty()) {
            return;
        }

        /* 分类只看用户原话，避免助手的“我答应你”把每一轮都判成约定；话题/实体看整段对话。 */
        String category = MemorySignals.categoryOf(user);
        List<String> topics = MemorySignals.topicsOf(user + "\n" + assistant);
        List<String> entities = MemorySignals.entitiesOf(user + "\n" + assistant);
        EmbeddingPort.Embedding embedding = embeddingService.embed(user + "\n" + assistant);

        MemoryChunk chunk = new MemoryChunk();
        chunk.setUserId(userId);
        chunk.setCharacterId(characterId);
        chunk.setConversationId(conversationId);
        chunk.setTurnId(turnId);
        chunk.setUserMessageId(userMessageId);
        chunk.setAssistantMessageId(assistantMessageId);
        chunk.setChunkText("用户：" + user + "\n她：" + assistant);
        chunk.setSummary(MemorySignals.summaryOf(user));
        chunk.setCategory(category);
        chunk.setTopicsJson(toJson(topics));
        chunk.setEntitiesJson(toJson(entities));
        chunk.setEmbeddingModel(embedding.model());
        chunk.setEmbeddingDim(embedding.dim());
        chunk.setEmbeddingJson(embeddingService.toJson(embedding.vector()));
        chunk.setValidFrom(Instant.now());
        try {
            chunkMapper.insert(chunk);
        } catch (DuplicateKeyException ex) {
            /* 并发重复轮次：唯一键兜底，直接视为已写入 */
            return;
        }

        if (refreshGraph) {
            graphService.refreshIncremental(userId, characterId);
        }
    }

    /** 供测试与补偿任务使用：按 turn 查重。 */
    public boolean exists(Long userId, String turnId) {
        Long count = chunkMapper.selectCount(Wrappers.<MemoryChunk>lambdaQuery()
                .eq(MemoryChunk::getUserId, userId)
                .eq(MemoryChunk::getTurnId, turnId));
        return count != null && count > 0;
    }

    private String toJson(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (Exception ex) {
            log.warn("记忆信号序列化失败：{}", ex.getMessage());
            return "[]";
        }
    }
}
