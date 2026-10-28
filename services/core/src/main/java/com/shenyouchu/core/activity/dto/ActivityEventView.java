package com.shenyouchu.core.activity.dto;

import com.shenyouchu.core.activity.ActivityEvent;

import java.time.Instant;

public record ActivityEventView(String id, String eventType, String actor, String source,
                                Instant occurredAt, String conversationId, String turnId, String payload) {

    public static ActivityEventView from(ActivityEvent event) {
        return new ActivityEventView(
                String.valueOf(event.getId()),
                event.getEventType(),
                event.getActor(),
                event.getSource(),
                event.getOccurredAt(),
                event.getConversationId() == null ? null : String.valueOf(event.getConversationId()),
                event.getTurnId(),
                event.getPayload());
    }
}
