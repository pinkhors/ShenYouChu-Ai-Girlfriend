package com.shenyouchu.core.voice.provider;

/** 同步说话响应：base64 音频，前端转 data URL 直接播放。 */
public record VoiceSpeakResponse(
        String audioBase64,
        String format,
        String provider,
        long latencyMs
) {
}
