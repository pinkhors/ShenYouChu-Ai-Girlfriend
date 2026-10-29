package com.shenyouchu.core.llm;

import com.shenyouchu.core.llm.settings.UserLlmSettingsService;
import com.shenyouchu.core.turn.SimplePersonaReplyGenerator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 纯逻辑测试：context 通过 {@link UserLlmReplyGenerator} 透传到 HTTP 客户端，
 * 且不拼进用户本轮发言（文档 09 §8.6 / AC-16）。不使用 Mockito。
 */
class UserLlmReplyGeneratorContextTest {

    private static final Long USER_ID = 1L;
    private static final Long CHARACTER_ID = 2L;

    private static final EffectiveLlmConfig CONFIG =
            new EffectiveLlmConfig(true, "http://localhost:9999/v1", "secret", "test-model",
                    256, 0.8, 30, "USER");

    private static final class RecordingHttpClient extends LlmHttpClient {

        private String systemPrompt;
        private String context;
        private String userText;
        private double temperature;

        @Override
        public String complete(EffectiveLlmConfig config, String systemPrompt, String context,
                               String userText, int maxTokens, double temperature) {
            this.systemPrompt = systemPrompt;
            this.context = context;
            this.userText = userText;
            this.temperature = temperature;
            return "带上下文的回复";
        }
    }

    private static final class StubSettingsService extends UserLlmSettingsService {

        private final EffectiveLlmConfig config;

        StubSettingsService(EffectiveLlmConfig config) {
            super(null, null, null);
            this.config = config;
        }

        @Override
        public EffectiveLlmConfig effective(Long userId) {
            return config;
        }
    }

    @Test
    void contextIsPassedAsIndependentArgument() {
        RecordingHttpClient httpClient = new RecordingHttpClient();
        UserLlmReplyGenerator generator = new UserLlmReplyGenerator(
                new SimplePersonaReplyGenerator(), new StubSettingsService(CONFIG), httpClient);

        String reply = generator.generate(USER_ID, CHARACTER_ID, "SYSTEM", "CONTEXT", "USER", 0.62);

        assertThat(reply).isEqualTo("带上下文的回复");
        assertThat(httpClient.systemPrompt).isEqualTo("SYSTEM");
        assertThat(httpClient.context).isEqualTo("CONTEXT");
        assertThat(httpClient.userText).isEqualTo("USER");
        assertThat(httpClient.temperature).isEqualTo(0.62);
    }
}
