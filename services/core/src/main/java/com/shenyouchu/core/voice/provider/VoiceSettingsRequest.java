package com.shenyouchu.core.voice.provider;

import java.util.Map;

/** 通话默认声音的保存请求。 */
public record VoiceSettingsRequest(Boolean enabled, String providerId, Map<String, String> params) {
}
