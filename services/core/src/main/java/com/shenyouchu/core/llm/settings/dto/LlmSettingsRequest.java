package com.shenyouchu.core.llm.settings.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * 保存用户 LLM 配置的请求。
 * apiKey 为空表示“不修改已有 Key”；要清空请调用 DELETE 重置为用户默认/环境变量。
 */
public record LlmSettingsRequest(
        boolean enabled,
        @Size(max = 500) String baseUrl,
        @Size(max = 200) String model,
        @Size(max = 512) String apiKey,
        @Min(1) @Max(4096) Integer maxTokens,
        @DecimalMin("0.0") @DecimalMax("2.0") Double temperature,
        @Min(1) @Max(120) Integer timeoutSeconds) {
}
