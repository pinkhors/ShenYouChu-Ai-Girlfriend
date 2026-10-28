package com.shenyouchu.core.llm;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EffectiveLlmConfigTest {

    private static EffectiveLlmConfig config(boolean enabled, String baseUrl, String model) {
        return new EffectiveLlmConfig(enabled, baseUrl, "key", model, 512, 0.8, 60, "USER");
    }

    @Test
    void usableOnlyWhenEnabledAndBaseUrlAndModelPresent() {
        assertThat(config(true, "https://api.example.com/v1", "deepseek-chat").usable()).isTrue();
        assertThat(config(false, "https://api.example.com/v1", "deepseek-chat").usable()).isFalse();
        assertThat(config(true, "", "deepseek-chat").usable()).isFalse();
        assertThat(config(true, "https://api.example.com/v1", "  ").usable()).isFalse();
        assertThat(config(true, null, "deepseek-chat").usable()).isFalse();
    }
}
