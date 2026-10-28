package com.shenyouchu.core.message.dto;

import com.shenyouchu.core.message.Message;

import java.time.Instant;

public record MessageView(String id, String role, String content, Instant createdAt) {

    public static MessageView from(Message message) {
        return new MessageView(
                String.valueOf(message.getId()),
                message.getRole(),
                message.getContent(),
                message.getCreatedAt());
    }
}
