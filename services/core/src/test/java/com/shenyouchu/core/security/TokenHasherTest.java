package com.shenyouchu.core.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TokenHasherTest {

    @Test
    void hashIsDeterministicAndHex() {
        String hash = TokenHasher.sha256Hex("hello");
        assertThat(hash).hasSize(64).isEqualTo(TokenHasher.sha256Hex("hello"));
    }

    @Test
    void newTokensAreUrlSafeAndUnique() {
        String first = TokenHasher.newToken();
        String second = TokenHasher.newToken();
        assertThat(first).isNotEqualTo(second).doesNotContain("+", "/", "=");
    }
}
