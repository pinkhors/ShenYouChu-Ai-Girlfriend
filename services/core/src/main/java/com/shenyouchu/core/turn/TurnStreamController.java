package com.shenyouchu.core.turn;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.security.CurrentUser;
import com.shenyouchu.core.turn.dto.TurnRequest;
import com.shenyouchu.core.turn.dto.TurnResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * SSE 流式轮次：先落库再按契约事件名下发。
 * M1 的事件序列与真实 LLM 流式一致（turn.started / assistant.text.delta / turn.completed），
 * 后续把 ReplyGenerator 换成流式 LLM 适配器即可，无需改客户端协议。
 */
@RestController
@RequestMapping("/api/v1/conversations/{conversationId}")
public class TurnStreamController {

    private static final int CHUNK_SIZE = 8;

    private final TurnService turnService;
    private final ObjectMapper objectMapper;

    public TurnStreamController(TurnService turnService, ObjectMapper objectMapper) {
        this.turnService = turnService;
        this.objectMapper = objectMapper;
    }

    @PostMapping(value = "/turns/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable Long conversationId, @Valid @RequestBody TurnRequest request) {
        Long userId = CurrentUser.require().userId();
        String text = request.message().trim();
        SseEmitter emitter = new SseEmitter(60_000L);

        CompletableFuture.runAsync(() -> {
            try {
                TurnResponse response = turnService.send(userId, conversationId, text);
                send(emitter, "turn.started", Map.of("turnId", response.turnId()));

                String content = response.assistantMessage().content();
                for (int index = 0; index < content.length(); index += CHUNK_SIZE) {
                    String delta = content.substring(index, Math.min(index + CHUNK_SIZE, content.length()));
                    send(emitter, "assistant.text.delta", Map.of("delta", delta));
                    Thread.sleep(20L);
                }
                send(emitter, "turn.completed", Map.of(
                        "turnId", response.turnId(),
                        "messageId", response.assistantMessage().id()));
                emitter.complete();
            } catch (Exception ex) {
                emitter.completeWithError(ex);
            }
        });
        return emitter;
    }

    private void send(SseEmitter emitter, String event, Map<String, Object> payload) throws Exception {
        emitter.send(SseEmitter.event()
                .name(event)
                .data(objectMapper.writeValueAsString(payload), MediaType.APPLICATION_JSON));
    }
}
