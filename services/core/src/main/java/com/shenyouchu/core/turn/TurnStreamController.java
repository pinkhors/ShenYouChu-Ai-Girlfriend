package com.shenyouchu.core.turn;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.security.CurrentUser;
import com.shenyouchu.core.turn.dto.TurnRequest;
import com.shenyouchu.core.turn.dto.TurnResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(TurnStreamController.class);

    private final TurnService turnService;
    private final ObjectMapper objectMapper;
    private final TurnCancellationRegistry cancellationRegistry;

    public TurnStreamController(TurnService turnService, ObjectMapper objectMapper,
                                TurnCancellationRegistry cancellationRegistry) {
        this.turnService = turnService;
        this.objectMapper = objectMapper;
        this.cancellationRegistry = cancellationRegistry;
    }

    @PostMapping(value = "/turns/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable Long conversationId, @Valid @RequestBody TurnRequest request) {
        Long userId = CurrentUser.require().userId();
        String text = request.message().trim();
        /* 用户可把 LLM 读超时配到 120s，SSE 超时留出余量，避免服务端还在生成时客户端先断 */
        SseEmitter emitter = new SseEmitter(180_000L);

        CompletableFuture.runAsync(() -> {
            String turnId = null;
            try {
                TurnResponse response = turnService.send(userId, conversationId, text);
                turnId = response.turnId();
                cancellationRegistry.register(turnId, userId);
                send(emitter, "turn.started", Map.of("turnId", turnId));

                String content = response.assistantMessage().content();
                for (int index = 0; index < content.length(); index += CHUNK_SIZE) {
                    if (cancellationRegistry.isCancelled(turnId)) {
                        send(emitter, "turn.cancelled", Map.of("turnId", turnId, "reason", "user"));
                        emitter.complete();
                        return;
                    }
                    String delta = content.substring(index, Math.min(index + CHUNK_SIZE, content.length()));
                    send(emitter, "assistant.text.delta", Map.of("delta", delta));
                    Thread.sleep(20L);
                }
                send(emitter, "turn.completed", Map.of(
                        "turnId", turnId,
                        "messageId", response.assistantMessage().id()));
                emitter.complete();
            } catch (Exception ex) {
                log.error("SSE turn failed: conversationId={}", conversationId, ex);
                try {
                    send(emitter, "turn.failed", Map.of(
                            "code", "INTERNAL_ERROR",
                            "message", "本轮回复失败，请重试"));
                } catch (Exception ignored) {
                    /* 客户端可能已断开，忽略二次发送失败 */
                }
                emitter.complete();
            } finally {
                if (turnId != null) {
                    cancellationRegistry.clear(turnId);
                }
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
