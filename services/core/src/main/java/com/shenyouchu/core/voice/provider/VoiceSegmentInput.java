package com.shenyouchu.core.voice.provider;

import java.util.Map;

/** 批量生成中的一段。 */
public record VoiceSegmentInput(
        String id,
        String providerId,
        String capability,
        String text,
        Map<String, String> params
) {
}
