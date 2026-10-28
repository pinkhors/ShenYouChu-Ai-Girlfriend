package com.shenyouchu.core.memory.dto;

import com.shenyouchu.core.memory.Memory;

import java.time.Instant;

public record MemoryView(String id, String memoryType, String content, String status,
                         Instant createdAt, String conversationId) {

    public static MemoryView from(Memory memory) {
        return new MemoryView(
                String.valueOf(memory.getId()),
                memory.getMemoryType(),
                memory.getContent(),
                memory.getStatus(),
                memory.getCreatedAt(),
                memory.getConversationId() == null ? null : String.valueOf(memory.getConversationId()));
    }
}
