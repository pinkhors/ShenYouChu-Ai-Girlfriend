package com.shenyouchu.core.voice.provider;

import java.util.Map;

/** 一次单段合成请求；params 放 capability 相关的动态字段。 */
public record VoiceSynthesisCommand(
        VoiceCapability capability,
        String text,
        Map<String, String> params,
        String outputFormat
) {
}
