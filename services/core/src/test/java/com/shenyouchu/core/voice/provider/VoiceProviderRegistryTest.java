package com.shenyouchu.core.voice.provider;

import com.shenyouchu.core.common.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VoiceProviderRegistryTest {

    private static VoiceProvider stubProvider(String id, boolean enabled, VoiceCapability... caps) {
        VoiceProviderDescriptor descriptor = new VoiceProviderDescriptor(
                id, id, "", Set.of(caps), List.of(), Map.of(), List.of("zh"), 100, enabled);
        return new VoiceProvider() {
            @Override
            public VoiceProviderDescriptor descriptor() {
                return descriptor;
            }

            @Override
            public VoiceProviderValidation validate(Map<String, String> credential) {
                return VoiceProviderValidation.ok();
            }

            @Override
            public VoiceSynthesisResult synthesize(VoiceSynthesisCommand command, Map<String, String> credential) {
                return new VoiceSynthesisResult(new byte[]{1}, "mp3", null);
            }
        };
    }

    @Test
    void registersByIdAndRejectsUnknown() {
        VoiceProviderRegistry registry = new VoiceProviderRegistry(
                List.of(stubProvider("a", true, VoiceCapability.SPEAK),
                        stubProvider("b", true, VoiceCapability.SING)));
        assertThat(registry.require("a").descriptor().id()).isEqualTo("a");
        assertThat(registry.all()).hasSize(2);
        assertThatThrownBy(() -> registry.require("missing"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("语音模型不存在");
    }
}
