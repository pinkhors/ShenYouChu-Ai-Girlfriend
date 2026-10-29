package com.shenyouchu.core.conversation.dto;

/** 幂等创建会话的结果：created=false 表示复用已有会话。 */
public record EnsureConversationResult(ConversationView conversation, boolean created) {
}
