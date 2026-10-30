package com.shenyouchu.core.voice.provider;

/** 单段生成结果；audioBase64 为空表示未成功。 */
public record VoiceSegmentView(
        String id,
        String providerId,
        String capability,
        String status,
        String audioBase64,
        String format,
        Long durationMs,
        String errorCode,
        String message
) {
}
