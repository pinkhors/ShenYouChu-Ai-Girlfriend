package com.shenyouchu.core.character.dto;

/** 切换当前角色请求；characterId 为雪花 ID 字符串。 */
public record ActiveCharacterRequest(String characterId) {
}
