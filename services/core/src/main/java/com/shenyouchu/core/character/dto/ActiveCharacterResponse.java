package com.shenyouchu.core.character.dto;

/**
 * 当前角色响应：PUT /preferences/active-character。
 *
 * <p>conversationId 是该角色唯一会话的 ID，前端可直接跳转聊天，无需再创建会话。
 */
public record ActiveCharacterResponse(String activeCharacterId, String conversationId) {
}
