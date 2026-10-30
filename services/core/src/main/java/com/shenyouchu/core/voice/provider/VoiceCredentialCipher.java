package com.shenyouchu.core.voice.provider;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 凭据加密：AES-256-GCM。密钥由部署环境提供；开发默认值只用于本地启动，生产必须覆盖。
 * 密文格式：Base64(nonce[12] + ciphertext)。
 */
@Component
public class VoiceCredentialCipher {

    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final byte[] AAD = "shenyouchu.voice.credential".getBytes(StandardCharsets.UTF_8);

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public VoiceCredentialCipher(
            @Value("${shenyouchu.voice.credentials-key:dev-only-key-please-change-me-32}") String rawKey) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((rawKey == null ? "" : rawKey).getBytes(StandardCharsets.UTF_8));
            this.key = new SecretKeySpec(digest, "AES");
        } catch (Exception ex) {
            throw new IllegalStateException("无法初始化语音凭据加密密钥", ex);
        }
    }

    public String encrypt(String plaintext) {
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(AAD);
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(
                    ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array());
        } catch (Exception ex) {
            throw new IllegalStateException("语音凭据加密失败", ex);
        }
    }

    public String decrypt(String token) {
        try {
            byte[] all = Base64.getDecoder().decode(token);
            if (all.length <= NONCE_BYTES) {
                throw new IllegalArgumentException("invalid token");
            }
            byte[] nonce = new byte[NONCE_BYTES];
            byte[] encrypted = new byte[all.length - NONCE_BYTES];
            System.arraycopy(all, 0, nonce, 0, NONCE_BYTES);
            System.arraycopy(all, NONCE_BYTES, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(AAD);
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new IllegalStateException("语音凭据解密失败", ex);
        }
    }
}
