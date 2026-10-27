package com.shenyouchu.core.conversation.dto;

import com.shenyouchu.core.conversation.Conversation;

import java.time.Instant;

public record ConversationView(String id, String characterId, String title,
                               Instant lastMessageAt, Instant createdAt, String status) {

    public static ConversationView from(Conversation conversation) {
        return new ConversationView(
                conversation.getId(),
                conversation.getCharacterId(),
                conversation.getTitle(),
                conversation.getLastMessageAt(),
                conversation.getCreatedAt(),
                conversation.getStatus());
    }
}
