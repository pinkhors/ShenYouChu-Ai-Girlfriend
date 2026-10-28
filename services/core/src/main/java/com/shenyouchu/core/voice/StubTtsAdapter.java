package com.shenyouchu.core.voice;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 占位 TTS：不产生音频，只返回 none 格式，前端据此显示文本回复。
 * 接入 CosyVoice 后替换同一接口即可。
 */
@Component
@ConditionalOnProperty(name = "shenyouchu.voice.enabled", havingValue = "false", matchIfMissing = true)
public class StubTtsAdapter implements TtsAdapter {

    @Override
    public TtsResult synthesize(String text, String emotion) {
        return new TtsResult(new byte[0], "none");
    }
}
