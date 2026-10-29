package com.shenyouchu.core.llm;

import com.shenyouchu.core.llm.settings.UserLlmSettingsService;
import com.shenyouchu.core.turn.SimplePersonaReplyGenerator;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 纯逻辑测试：角色级温度覆盖用户配置；NaN 时沿用用户配置（文档 09 §7 / AC-6）。
 *
 * <p>用轻量假实现代替 Mockito，避免依赖 mock maker 与动态 agent。
 */
class UserLlmReplyGeneratorTemperatureTest {

    private static final Long USER_ID = 1L;
    private static final Long CHARACTER_ID = 2L;

    private static final EffectiveLlmConfig CONFIG =
            new EffectiveLlmConfig(true, "http://localhost:9999/v1", "secret", "test-model",
                    256, 0.8, 30, "USER");

    /** 记录调用参数的 Http 客户端假实现。 */
    private static final class RecordingHttpClient extends LlmHttpClient {

        private final List<Double> temperatures = new ArrayList<>();
        private double maxTokens;
        private String systemPrompt;
        private String userText;

        @Override
        public String complete(EffectiveLlmConfig config, String systemPrompt, String userText,
                               int maxTokens, double temperature) {
            this.systemPrompt = systemPrompt;
            this.userText = userText;
            this.maxTokens = maxTokens;
            this.temperatures.add(temperature);
            return "模型回复";
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
    void characterTemperatureOverridesUserConfig() {
        RecordingHttpClient httpClient = new RecordingHttpClient();
        UserLlmReplyGenerator generator = new UserLlmReplyGenerator(
                new SimplePersonaReplyGenerator(), new StubSettingsService(CONFIG), httpClient);

        String reply = generator.generate(USER_ID, CHARACTER_ID, "SYSTEM", "USER", 0.55);

        assertThat(reply).isEqualTo("模型回复");
        assertThat(httpClient.temperatures).containsExactly(0.55);
        assertThat(httpClient.systemPrompt).isEqualTo("SYSTEM");
        assertThat(httpClient.userText).isEqualTo("USER");
        assertThat(httpClient.maxTokens).isEqualTo(256);
    }

    @Test
    void nanTemperatureFallsBackToUserConfig() {
        RecordingHttpClient httpClient = new RecordingHttpClient();
        UserLlmReplyGenerator generator = new UserLlmReplyGenerator(
                new SimplePersonaReplyGenerator(), new StubSettingsService(CONFIG), httpClient);

        generator.generate(USER_ID, CHARACTER_ID, "SYSTEM", "USER", Double.NaN);

        assertThat(httpClient.temperatures).containsExactly(0.8);
    }

    @Test
    void legacyThreeArgCallKeepsUserConfigTemperature() {
        RecordingHttpClient httpClient = new RecordingHttpClient();
        UserLlmReplyGenerator generator = new UserLlmReplyGenerator(
                new SimplePersonaReplyGenerator(), new StubSettingsService(CONFIG), httpClient);

        generator.generate(USER_ID, "SYSTEM", "USER");

        assertThat(httpClient.temperatures).containsExactly(0.8);
    }

    @Test
    void unusableConfigFallsBackToDeterministicReply() {
        RecordingHttpClient httpClient = new RecordingHttpClient();
        EffectiveLlmConfig disabled = new EffectiveLlmConfig(false, null, null, null, 256, 0.8, 30, "NONE");
        UserLlmReplyGenerator generator = new UserLlmReplyGenerator(
                new SimplePersonaReplyGenerator(), new StubSettingsService(disabled), httpClient);

        String reply = generator.generate(USER_ID, CHARACTER_ID, "SYSTEM", "你在吗", 0.55);

        assertThat(reply).contains("我在听");
        assertThat(httpClient.temperatures).isEmpty();
    }
}
