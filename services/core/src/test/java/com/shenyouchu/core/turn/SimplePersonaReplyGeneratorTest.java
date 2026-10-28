package com.shenyouchu.core.turn;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SimplePersonaReplyGeneratorTest {

    private final SimplePersonaReplyGenerator generator = new SimplePersonaReplyGenerator();

    @Test
    void emptyInputGetsGentleFallback() {
        assertThat(generator.generate("prompt", "  ")).isEqualTo("我在呢，你说。");
    }

    @Test
    void longInputIsTruncated() {
        String reply = generator.generate("prompt", "a".repeat(100));
        assertThat(reply).contains("…");
    }
}
