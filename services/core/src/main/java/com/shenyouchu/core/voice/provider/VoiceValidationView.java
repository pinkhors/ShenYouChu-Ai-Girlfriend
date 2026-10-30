package com.shenyouchu.core.voice.provider;

import java.util.List;

/** 凭据校验响应。 */
public record VoiceValidationView(boolean valid, String message) {

    public static VoiceValidationView from(VoiceProviderValidation validation) {
        return new VoiceValidationView(validation.valid(), validation.message());
    }
}
