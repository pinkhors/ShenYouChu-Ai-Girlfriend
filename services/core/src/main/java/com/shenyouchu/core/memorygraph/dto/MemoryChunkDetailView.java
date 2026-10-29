package com.shenyouchu.core.memorygraph.dto;

import java.time.Instant;
import java.util.List;

/** 记忆详情：星图下潜到“地表”时展示，含原文与来源消息。 */
public record MemoryChunkDetailView(
        String id,
        String characterId,
        String conversationId,
        String userMessageId,
        String assistantMessageId,
        String content,
        String summary,
        List<String> topics,
        List<String> entities,
        String category,
        Instant createdAt,
        Instant invalidAt) {
}
