package com.shenyouchu.core.character.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 创建角色请求。只接收结构化字段：不接受 systemPrompt / personaPrompt / rawConfig 等自由提示词。
 */
public record CreateCharacterRequest(
        String displayName,
        Integer age,
        String intro,
        JsonNode avatarConfig,
        PersonalityView personality,
        FamilyView family,
        String sourceCharacterId) {
}
