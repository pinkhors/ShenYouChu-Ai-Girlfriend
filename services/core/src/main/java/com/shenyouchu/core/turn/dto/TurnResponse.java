package com.shenyouchu.core.turn.dto;

import com.shenyouchu.core.message.dto.MessageView;

public record TurnResponse(String turnId, MessageView userMessage, MessageView assistantMessage) {
}
