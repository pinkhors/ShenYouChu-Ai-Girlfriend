package com.shenyouchu.core.voice;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * 占位 ASR：把音频字节按 UTF-8 文本解码，仅用于在未接入真实语音模型时验证链路。
 * 真实实现（FunASR / Paraformer）接入后由同一接口替换。
 */
@Component
@ConditionalOnProperty(name = "shenyouchu.voice.enabled", havingValue = "false", matchIfMissing = true)
public class StubAsrAdapter implements AsrAdapter {

    @Override
    public AsrResult transcribe(byte[] audio, String contentType) {
        if (audio == null || audio.length == 0) {
            return new AsrResult("", 0.0);
        }
        String text = new String(audio, StandardCharsets.UTF_8).trim();
        return new AsrResult(text, text.isEmpty() ? 0.0 : 1.0);
    }
}
