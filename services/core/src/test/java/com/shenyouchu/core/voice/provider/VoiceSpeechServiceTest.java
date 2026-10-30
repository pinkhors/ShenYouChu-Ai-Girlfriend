package com.shenyouchu.core.voice.provider;

import com.shenyouchu.core.common.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VoiceSpeechServiceTest {

    private static VoiceProvider provider(String id, boolean enabled, VoiceCapability... caps) {
        VoiceProviderDescriptor descriptor = new VoiceProviderDescriptor(
                id, id, "", Set.of(caps), List.of(), Map.of(), List.of("zh"), 10, enabled);
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
                return new VoiceSynthesisResult(new byte[]{1, 2}, "mp3", null);
            }
        };
    }

    private static VoiceCredentialService credentials() {
        return new VoiceCredentialService(null, null, null, null) {
            @Override
            public Map<String, String> resolve(Long userId, String providerId) {
                return Map.of("apiKey", "test");
            }
        };
    }

    private static VoiceSettingsService settings(String providerId, boolean configured) {
        return new VoiceSettingsService(null, null, null, null) {
            @Override
            public VoiceSettingsView requireActive(Long userId) {
                if (!configured) {
                    throw ApiException.badRequest("VOICE_SETTINGS_MISSING", "请先在语音页设置通话默认声音");
                }
                return new VoiceSettingsView(true, true, providerId, Map.of("voiceId", "v1"));
            }
        };
    }

    private VoiceSpeechService service(VoiceProvider... providers) {
        return new VoiceSpeechService(
                new VoiceProviderRegistry(List.of(providers)),
                credentials(),
                settings(providers.length > 0 ? providers[0].descriptor().id() : "none", true));
    }

    @Test
    void rejectsBlankText() {
        VoiceSpeechService service = service(provider("a", true, VoiceCapability.SPEAK));
        assertThatThrownBy(() -> service.speak(1L, new VoiceSpeakRequest("  ", "a", Map.of())))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("文本不能为空");
    }

    @Test
    void rejectsDisabledProviderAndUnsupportedCapability() {
        VoiceSpeechService off = service(provider("off", false, VoiceCapability.SPEAK));
        assertThatThrownBy(() -> off.speak(1L, new VoiceSpeakRequest("你好", "off", Map.of())))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("暂未开放");

        VoiceSpeechService singOnly = service(provider("sing", true, VoiceCapability.SING));
        assertThatThrownBy(() -> singOnly.speak(1L, new VoiceSpeakRequest("你好", "sing", Map.of())))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("不支持说话");
    }

    @Test
    void rejectsTextOverProviderLimit() {
        VoiceSpeechService service = service(provider("a", true, VoiceCapability.SPEAK));
        assertThatThrownBy(() -> service.speak(1L, new VoiceSpeakRequest("字".repeat(11), "a", Map.of())))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("超过");
    }

    @Test
    void fallsBackToDefaultSettingsWhenProviderMissing() {
        VoiceSpeechService service = service(provider("a", true, VoiceCapability.SPEAK));
        VoiceSpeakResponse response = service.speak(1L, new VoiceSpeakRequest("你好", null, null));
        assertThat(response.provider()).isEqualTo("a");
        assertThat(response.format()).isEqualTo("mp3");
        assertThat(response.audioBase64()).isNotBlank();
    }

    @Test
    void reportsMissingSettingsWhenNoneConfigured() {
        VoiceSpeechService service = new VoiceSpeechService(
                new VoiceProviderRegistry(List.of(provider("a", true, VoiceCapability.SPEAK))),
                credentials(),
                settings("a", false));
        assertThatThrownBy(() -> service.speak(1L, new VoiceSpeakRequest("你好", null, null)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("通话默认声音");
    }
}
