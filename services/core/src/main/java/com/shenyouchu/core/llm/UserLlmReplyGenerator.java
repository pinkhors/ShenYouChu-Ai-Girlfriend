package com.shenyouchu.core.llm;

import com.shenyouchu.core.llm.settings.UserLlmSettingsService;
import com.shenyouchu.core.turn.ReplyGenerator;
import com.shenyouchu.core.turn.SimplePersonaReplyGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * 按当前用户选择 LLM 配置：
 * 用户配置 → 环境变量 → 确定性占位回复。
 * 任何异常、空回复都回退到 {@link SimplePersonaReplyGenerator}。
 */
@Component
@Primary
public class UserLlmReplyGenerator implements ReplyGenerator {

    private static final Logger log = LoggerFactory.getLogger(UserLlmReplyGenerator.class);

    private final SimplePersonaReplyGenerator fallback;
    private final UserLlmSettingsService settingsService;
    private final LlmHttpClient httpClient;

    public UserLlmReplyGenerator(SimplePersonaReplyGenerator fallback,
                                 UserLlmSettingsService settingsService,
                                 LlmHttpClient httpClient) {
        this.fallback = fallback;
        this.settingsService = settingsService;
        this.httpClient = httpClient;
    }

    @Override
    public String generate(Long userId, String systemPrompt, String userText) {
        return generate(userId, null, systemPrompt, "", userText, Double.NaN);
    }

    /**
     * 无上下文入口：委托 6 参方法并传空 context，保持既有行为（文档 09 §8.6）。
     */
    @Override
    public String generate(Long userId, Long characterId, String systemPrompt, String userText,
                           double temperature) {
        return generate(userId, characterId, systemPrompt, "", userText, temperature);
    }

    /**
     * 角色级温度 + 独立上下文入口：temperature 为 NaN 时沿用用户配置，
     * context 非空时作为独立 system message 交给模型。
     * 任何异常、空回复都回退到确定性占位回复。
     */
    @Override
    public String generate(Long userId, Long characterId, String systemPrompt, String context,
                           String userText, double temperature) {
        try {
            EffectiveLlmConfig config = settingsService.effective(userId);
            if (!config.usable()) {
                return fallback.generate(userId, characterId, systemPrompt, userText, temperature);
            }
            double effectiveTemperature = Double.isNaN(temperature) ? config.temperature() : temperature;
            String reply = httpClient.complete(config, systemPrompt, context, userText,
                    config.maxTokens(), effectiveTemperature);
            if (reply.isBlank()) {
                return fallback.generate(userId, characterId, systemPrompt, userText, temperature);
            }
            return reply;
        } catch (Exception ex) {
            log.warn("LLM call failed for user {}, falling back to deterministic reply: {}",
                    userId, ex.getMessage());
            return fallback.generate(userId, characterId, systemPrompt, userText, temperature);
        }
    }
}
