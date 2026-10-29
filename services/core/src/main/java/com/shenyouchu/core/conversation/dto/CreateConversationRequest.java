package com.shenyouchu.core.conversation.dto;

/**
 * 创建会话请求。
 *
 * <p>title 已废弃：每个角色只有一条会话，标题由首条消息生成/清空维护；字段保留仅为兼容旧客户端，
 * 服务端不会读取或校验该值。
 */
public record CreateConversationRequest(String title, String characterId) {
}
