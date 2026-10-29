package com.shenyouchu.core.character.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 更新角色请求（PATCH）。字段为 null 表示“不修改”；version 必须携带，用于乐观锁。
 */
public record UpdateCharacterRequest(
        String displayName,
        Integer age,
        String intro,
        JsonNode avatarConfig,
        PersonalityView personality,
        FamilyView family,
        Long version,
        ExpressionConfig expression) {
}
