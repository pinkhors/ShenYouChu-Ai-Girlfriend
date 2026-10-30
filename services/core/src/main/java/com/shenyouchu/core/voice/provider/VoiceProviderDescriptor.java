package com.shenyouchu.core.voice.provider;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** 一个语音模型的静态能力与动态表单描述。 */
public record VoiceProviderDescriptor(
        String id,
        String displayName,
        String description,
        Set<VoiceCapability> capabilities,
        List<VoiceFieldSchema> credentialFields,
        Map<VoiceCapability, List<VoiceFieldSchema>> generationFields,
        List<String> languages,
        int maxTextChars,
        boolean enabled
) {
}
