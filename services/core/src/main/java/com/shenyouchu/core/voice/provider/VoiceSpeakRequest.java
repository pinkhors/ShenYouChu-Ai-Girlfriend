package com.shenyouchu.core.voice.provider;

import java.util.Map;

/** 同步说话请求：通话页不传 providerId 时使用用户默认声音。 */
public record VoiceSpeakRequest(String text, String providerId, Map<String, String> params) {
}
