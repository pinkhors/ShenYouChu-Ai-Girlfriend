package com.shenyouchu.core.llm;

/**
 * 一次 LLM 调用的有效配置。
 * source：USER=用户设置，ENV=服务端环境变量兜底，NONE=未配置。
 */
public record EffectiveLlmConfig(
        boolean enabled,
        String baseUrl,
        String apiKey,
        String model,
        int maxTokens,
        double temperature,
        int timeoutSeconds,
        String source) {

    public boolean usable() {
        return enabled
                && baseUrl != null && !baseUrl.isBlank()
                && model != null && !model.isBlank();
    }

    /** record 默认 toString 会带 apiKey；日志里必须脱敏。 */
    @Override
    public String toString() {
        return "EffectiveLlmConfig[enabled=" + enabled
                + ", baseUrl=" + baseUrl
                + ", model=" + model
                + ", maxTokens=" + maxTokens
                + ", temperature=" + temperature
                + ", timeoutSeconds=" + timeoutSeconds
                + ", source=" + source
                + ", apiKey=***]";
    }
}
