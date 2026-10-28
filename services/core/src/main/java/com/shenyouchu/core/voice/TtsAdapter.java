package com.shenyouchu.core.voice;

/** 语音合成 seam：真实实现接 CosyVoice，按情绪指令调整语气。 */
public interface TtsAdapter {

    TtsResult synthesize(String text, String emotion);
}
