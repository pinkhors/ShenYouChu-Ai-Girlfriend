package com.shenyouchu.core.voice;

import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.security.CurrentUser;
import com.shenyouchu.core.turn.TurnService;
import com.shenyouchu.core.turn.dto.TurnResponse;
import com.shenyouchu.core.voice.dto.VoiceTurnRequest;
import com.shenyouchu.core.voice.dto.VoiceTurnResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Base64;

/**
 * 语音轮次：音频 → ASR → 文本轮次（含记忆与活动事件）→ TTS。
 * M2 先用占位适配器打通链路；接入真实模型后协议不变（partial/final 事件后续补充）。
 */
@RestController
@RequestMapping("/api/v1/conversations/{conversationId}")
public class VoiceTurnController {

    private final TurnService turnService;
    private final AsrAdapter asrAdapter;
    private final TtsAdapter ttsAdapter;

    public VoiceTurnController(TurnService turnService, AsrAdapter asrAdapter, TtsAdapter ttsAdapter) {
        this.turnService = turnService;
        this.asrAdapter = asrAdapter;
        this.ttsAdapter = ttsAdapter;
    }

    @PostMapping("/voice-turns")
    public VoiceTurnResponse voiceTurn(@PathVariable Long conversationId,
                                       @Valid @RequestBody VoiceTurnRequest request) {
        Long userId = CurrentUser.require().userId();
        byte[] audio;
        try {
            audio = Base64.getDecoder().decode(request.audioBase64());
        } catch (IllegalArgumentException ex) {
            throw ApiException.validation("audioBase64 不是合法的 Base64");
        }

        AsrResult asr = asrAdapter.transcribe(audio, request.contentType());
        if (asr.text().isBlank()) {
            throw ApiException.validation("没有识别到有效语音内容");
        }

        TurnResponse turn = turnService.send(userId, conversationId, asr.text());
        TtsResult tts = ttsAdapter.synthesize(turn.assistantMessage().content(), "neutral");

        return new VoiceTurnResponse(
                turn.turnId(),
                asr.text(),
                asr.confidence(),
                turn.assistantMessage(),
                Base64.getEncoder().encodeToString(tts.audio()),
                tts.format());
    }
}
