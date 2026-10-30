package com.shenyouchu.core.voice.provider;

import com.shenyouchu.core.common.ApiException;
import org.springframework.stereotype.Service;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/** 同步单段说话：通话页按句调用，不排队等批量任务。 */
@Service
public class VoiceSpeechService {

    private final VoiceProviderRegistry registry;
    private final VoiceCredentialService credentialService;
    private final VoiceSettingsService settingsService;

    public VoiceSpeechService(VoiceProviderRegistry registry,
                              VoiceCredentialService credentialService,
                              VoiceSettingsService settingsService) {
        this.registry = registry;
        this.credentialService = credentialService;
        this.settingsService = settingsService;
    }

    public VoiceSpeakResponse speak(Long userId, VoiceSpeakRequest request) {
        if (request == null || request.text() == null || request.text().trim().isEmpty()) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "文本不能为空");
        }
        String text = request.text().trim();

        String providerId = request.providerId();
        Map<String, String> params = request.params() == null ? Map.of() : request.params();
        if (providerId == null || providerId.isBlank()) {
            VoiceSettingsView settings = settingsService.requireActive(userId);
            providerId = settings.providerId();
            params = settings.params();
        }

        VoiceProvider provider = registry.require(providerId);
        VoiceProviderDescriptor descriptor = provider.descriptor();
        if (!descriptor.enabled()) {
            throw ApiException.badRequest("VOICE_PROVIDER_DISABLED", descriptor.displayName() + " 暂未开放");
        }
        if (!descriptor.capabilities().contains(VoiceCapability.SPEAK)) {
            throw ApiException.badRequest("VOICE_CAPABILITY_UNSUPPORTED", descriptor.displayName() + " 不支持说话");
        }
        if (text.length() > descriptor.maxTextChars()) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST",
                    "文本超过 " + descriptor.maxTextChars() + " 字上限");
        }

        Map<String, String> credential = credentialService.resolve(userId, providerId);
        long startedAt = System.nanoTime();
        VoiceSynthesisResult result = provider.synthesize(
                new VoiceSynthesisCommand(VoiceCapability.SPEAK, text, new LinkedHashMap<>(params), "mp3"),
                credential);
        if (result.audio() == null || result.audio().length == 0) {
            throw new ApiException("VOICE_PROVIDER_UNAVAILABLE",
                    org.springframework.http.HttpStatus.BAD_GATEWAY, "语音合成返回空音频");
        }
        long latencyMs = (System.nanoTime() - startedAt) / 1_000_000;
        return new VoiceSpeakResponse(
                Base64.getEncoder().encodeToString(result.audio()),
                result.format() == null || result.format().isBlank() ? "mp3" : result.format(),
                providerId,
                latencyMs);
    }
}
