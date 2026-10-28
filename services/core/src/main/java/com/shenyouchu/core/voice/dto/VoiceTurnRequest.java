package com.shenyouchu.core.voice.dto;

import jakarta.validation.constraints.NotBlank;

public record VoiceTurnRequest(
        @NotBlank String audioBase64,
        String contentType) {
}
