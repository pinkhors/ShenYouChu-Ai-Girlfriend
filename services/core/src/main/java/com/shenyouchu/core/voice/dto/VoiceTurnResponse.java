package com.shenyouchu.core.voice.dto;

import com.shenyouchu.core.message.dto.MessageView;

public record VoiceTurnResponse(String turnId, String recognizedText, double confidence,
                                MessageView assistantMessage, String ttsAudioBase64, String ttsFormat) {
}
