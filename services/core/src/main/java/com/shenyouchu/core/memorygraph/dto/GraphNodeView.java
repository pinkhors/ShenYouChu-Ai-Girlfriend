package com.shenyouchu.core.memorygraph.dto;

import java.time.Instant;

/** 星球：一条记忆的投影；不含向量与正文全文。 */
public record GraphNodeView(
        String id,
        String chunkId,
        String label,
        String category,
        double angle,
        double radius,
        double importance,
        boolean ghost,
        Instant createdAt,
        String conversationId) {
}
