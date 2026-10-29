package com.shenyouchu.core.character.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;

/**
 * 角色卡对外视图（契约见 docs/07-character-customization.md §5.4）。
 *
 * <p>ID 以字符串返回，避免 JavaScript 端丢失雪花 ID 精度（ADR-0005）。
 * <p>{@code isOfficial}/{@code isActive} 显式指定 JSON 字段名：Java record 的 boolean
 * 访问器是 isXxx()，默认 Bean 命名会被序列化成 xxx，破坏前端契约。
 * <p>官方角色不返回 v1 人设原文：personality/family 为 null，tags 由旧 traits 映射；
 * avatarConfig 为空时返回官方默认对象。自定义角色返回 v2 结构。
 * <p>{@code expression} 只对自定义角色返回（官方角色为 null，继续使用用户级温度）。
 */
public record CharacterView(
        String id,
        String code,
        String displayName,
        @JsonProperty("isOfficial") boolean isOfficial,
        @JsonProperty("isActive") boolean isActive,
        String status,
        int age,
        String intro,
        java.util.List<String> tags,
        JsonNode avatarConfig,
        PersonalityView personality,
        FamilyView family,
        long version,
        @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt,
        @JsonFormat(shape = JsonFormat.Shape.STRING) Instant updatedAt,
        ExpressionView expression) {
}
