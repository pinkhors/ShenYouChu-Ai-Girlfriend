package com.shenyouchu.core.voice.provider;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VoiceCredentialCipherTest {

    private final VoiceCredentialCipher cipher = new VoiceCredentialCipher("unit-test-key");

    @Test
    void roundTripsPlaintext() {
        String encrypted = cipher.encrypt("{\"apiKey\":\"sk-1\"}");
        assertThat(encrypted).isNotEqualTo("{\"apiKey\":\"sk-1\"}");
        assertThat(cipher.decrypt(encrypted)).isEqualTo("{\"apiKey\":\"sk-1\"}");
    }

    @Test
    void producesDifferentCiphertextsForSamePlaintext() {
        String first = cipher.encrypt("same");
        String second = cipher.encrypt("same");
        assertThat(first).isNotEqualTo(second);
        assertThat(cipher.decrypt(first)).isEqualTo("same");
        assertThat(cipher.decrypt(second)).isEqualTo("same");
    }

    @Test
    void rejectsTamperedToken() {
        String encrypted = cipher.encrypt("secret");
        byte[] raw = java.util.Base64.getDecoder().decode(encrypted);
        raw[raw.length - 1] ^= 0x55;
        String tampered = java.util.Base64.getEncoder().encodeToString(raw);
        assertThatThrownByDecrypt(tampered);
    }

    private void assertThatThrownByDecrypt(String token) {
        assertThat(cipher).isNotNull();
        try {
            cipher.decrypt(token);
            throw new AssertionError("expected decrypt to fail");
        } catch (IllegalStateException expected) {
            assertThat(expected).hasMessageContaining("解密");
        }
    }
}
