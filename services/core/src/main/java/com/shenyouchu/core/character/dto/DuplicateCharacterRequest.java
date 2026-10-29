package com.shenyouchu.core.character.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 复制角色请求：displayName 可省略（自动生成副本名）；avatarConfig 用于把官方角色的
 * 本机形象覆盖带入副本。本机立绘不在服务端，不会被复制。
 */
public record DuplicateCharacterRequest(
        String displayName,
        JsonNode avatarConfig) {
}
