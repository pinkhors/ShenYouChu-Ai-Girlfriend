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
        try {
            EffectiveLlmConfig config = settingsService.effective(userId);
            if (!config.usable()) {
                return fallback.generate(userId, systemPrompt, userText);
            }
            String reply = httpClient.complete(config, systemPrompt, userText);
            if (reply.isBlank()) {
                return fallback.generate(userId, systemPrompt, userText);
            }
            return reply;
        } catch (Exception ex) {
            log.warn("LLM call failed for user {}, falling back to deterministic reply: {}",
                    userId, ex.getMessage());
            return fallback.generate(userId, systemPrompt, userText);
        }
    }
}
