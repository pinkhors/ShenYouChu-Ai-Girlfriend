package com.shenyouchu.core.voice;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class StubVoiceAdaptersTest {

    private final StubAsrAdapter asr = new StubAsrAdapter();
    private final StubTtsAdapter tts = new StubTtsAdapter();

    @Test
    void stubAsrDecodesUtf8Text() {
        AsrResult result = asr.transcribe("你好".getBytes(StandardCharsets.UTF_8), "text/plain");
        assertThat(result.text()).isEqualTo("你好");
        assertThat(result.confidence()).isEqualTo(1.0);
    }

    @Test
    void stubAsrHandlesEmptyAudio() {
        AsrResult result = asr.transcribe(new byte[0], "audio/wav");
        assertThat(result.text()).isEmpty();
        assertThat(result.confidence()).isZero();
    }

    @Test
    void stubTtsReportsNoAudio() {
        TtsResult result = tts.synthesize("你好", "neutral");
        assertThat(result.format()).isEqualTo("none");
        assertThat(result.audio()).isEmpty();
    }
}
