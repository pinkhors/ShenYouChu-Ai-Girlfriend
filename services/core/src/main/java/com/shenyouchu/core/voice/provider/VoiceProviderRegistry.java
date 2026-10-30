package com.shenyouchu.core.voice.provider;

import com.shenyouchu.core.common.ApiException;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Provider 注册表：新增模型只需新增一个 VoiceProvider Bean。 */
@Component
public class VoiceProviderRegistry {

    private final Map<String, VoiceProvider> providers;

    public VoiceProviderRegistry(List<VoiceProvider> providers) {
        Map<String, VoiceProvider> byId = new LinkedHashMap<>();
        for (VoiceProvider provider : providers) {
            byId.put(provider.descriptor().id(), provider);
        }
        this.providers = Map.copyOf(byId);
    }

    public List<VoiceProvider> all() {
        return List.copyOf(providers.values());
    }

    public VoiceProvider require(String providerId) {
        VoiceProvider provider = providers.get(providerId);
        if (provider == null) {
            throw ApiException.notFound("VOICE_PROVIDER_NOT_FOUND", "语音模型不存在");
        }
        return provider;
    }

    public boolean contains(String providerId) {
        return providers.containsKey(providerId);
    }
}
