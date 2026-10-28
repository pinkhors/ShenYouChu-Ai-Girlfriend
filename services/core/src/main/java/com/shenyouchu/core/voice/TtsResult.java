package com.shenyouchu.core.voice;

/** TTS 结果：格式为 none 时表示未接入真实语音合成。 */
public record TtsResult(byte[] audio, String format) {
}
