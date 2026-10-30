package com.shenyouchu.core.voice.provider;

import java.util.Map;

/** 通话默认声音视图；未配置时 configured=false。 */
public record VoiceSettingsView(
        boolean configured,
        boolean enabled,
        String providerId,
        Map<String, String> params
) {
}
