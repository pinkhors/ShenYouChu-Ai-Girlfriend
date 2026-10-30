package com.shenyouchu.core.voice.provider;

/** 凭据校验结果；不包含任何密钥明文。 */
public record VoiceProviderValidation(boolean valid, String message) {

    public static VoiceProviderValidation ok() {
        return new VoiceProviderValidation(true, null);
    }

    public static VoiceProviderValidation fail(String message) {
        return new VoiceProviderValidation(false, message);
    }
}
