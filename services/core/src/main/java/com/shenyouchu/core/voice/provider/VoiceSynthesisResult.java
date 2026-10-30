package com.shenyouchu.core.voice.provider;

/** 适配器输出；音频统一为二进制，格式由适配器声明。 */
public record VoiceSynthesisResult(byte[] audio, String format, String providerRequestId) {
}
