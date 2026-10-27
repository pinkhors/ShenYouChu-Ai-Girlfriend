package com.shenyouchu.core.conversation.dto;

import com.shenyouchu.core.conversation.Conversation;

import java.time.Instant;

/**
 * 对外会话视图：ID 以字符串返回，避免 JavaScript 端丢失雪花 ID 精度（见 ADR-0005）。
 */
public record ConversationView(String id, String characterId, String title,
                               Instant lastMessageAt, Instant createdAt, String status) {

    public static ConversationView from(Conversation conversation) {
        return new ConversationView(
                String.valueOf(conversation.getId()),
                String.valueOf(conversation.getCharacterId()),
                conversation.getTitle(),
                conversation.getLastMessageAt(),
                conversation.getCreatedAt(),
                conversation.getStatus());
    }
}
