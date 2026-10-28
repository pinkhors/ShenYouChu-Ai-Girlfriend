package com.shenyouchu.core.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 服务端环境变量里的 LLM 默认配置；用户没有保存自己的配置时作为兜底。
 * 与 docs/05 中的 LLM_* 变量一致。
 */
@Component
public class LlmDefaults {

    private final boolean enabled;
    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final int maxTokens;
    private final double temperature;
    private final int timeoutSeconds;

    public LlmDefaults(
            @Value("${shenyouchu.llm.enabled:false}") boolean enabled,
            @Value("${shenyouchu.llm.base-url:}") String baseUrl,
            @Value("${shenyouchu.llm.api-key:}") String apiKey,
            @Value("${shenyouchu.llm.model:qwen3.7-plus}") String model,
            @Value("${shenyouchu.llm.max-tokens:256}") int maxTokens,
            @Value("${shenyouchu.llm.temperature:0.8}") double temperature,
            @Value("${shenyouchu.llm.timeout-seconds:30}") int timeoutSeconds) {
        this.enabled = enabled;
        this.baseUrl = trimToEmpty(baseUrl);
        this.apiKey = trimToEmpty(apiKey);
        this.model = trimToEmpty(model);
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.timeoutSeconds = timeoutSeconds;
    }

    public EffectiveLlmConfig config() {
        boolean configured = enabled && !baseUrl.isBlank() && !model.isBlank();
        return new EffectiveLlmConfig(
                enabled,
                baseUrl,
                apiKey,
                model,
                maxTokens,
                temperature,
                timeoutSeconds,
                configured ? "ENV" : "NONE");
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
