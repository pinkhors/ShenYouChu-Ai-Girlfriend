package com.shenyouchu.core.llm.settings.dto;

import java.time.Instant;

/**
 * 用户 LLM 配置的对外视图：只告诉前端“有没有 Key”，不返回 Key 明文。
 * source：USER=用户自己的配置，ENV=服务端环境变量兜底，NONE=未配置。
 */
public record LlmSettingsView(
        boolean enabled,
        String baseUrl,
        String model,
        boolean hasApiKey,
        int maxTokens,
        double temperature,
        int timeoutSeconds,
        String source,
        Instant updatedAt) {
}
