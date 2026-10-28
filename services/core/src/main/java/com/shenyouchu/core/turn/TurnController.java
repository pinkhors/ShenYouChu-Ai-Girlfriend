package com.shenyouchu.core.turn;

import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.common.IdempotencyService;
import com.shenyouchu.core.message.dto.MessagePage;
import com.shenyouchu.core.security.CurrentUser;
import com.shenyouchu.core.turn.dto.TurnRequest;
import com.shenyouchu.core.turn.dto.TurnResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}")
public class TurnController {

    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

    private final TurnService turnService;
    private final TurnCancellationRegistry cancellationRegistry;
    private final IdempotencyService idempotencyService;

    public TurnController(TurnService turnService,
                          TurnCancellationRegistry cancellationRegistry,
                          IdempotencyService idempotencyService) {
        this.turnService = turnService;
        this.cancellationRegistry = cancellationRegistry;
        this.idempotencyService = idempotencyService;
    }

    /**
     * 文本轮次。携带 {@code Idempotency-Key} 时，同一用户的重复请求返回首次结果，
     * 避免网络重试造成重复消息与重复记忆。
     */
    @PostMapping("/turns")
    public TurnResponse send(@PathVariable Long conversationId,
                             @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) String idempotencyKey,
                             @Valid @RequestBody TurnRequest request) {
        Long userId = CurrentUser.require().userId();
        return idempotencyService.find(idempotencyKey, userId, TurnResponse.class)
                .orElseGet(() -> {
                    TurnResponse response = turnService.send(userId, conversationId, request.message().trim());
                    idempotencyService.store(idempotencyKey, userId, response);
                    return response;
                });
    }

    /** 取消进行中的流式轮次；轮次不存在、已完成或不属于当前用户都返回 404。 */
    @PostMapping("/turns/{turnId}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable Long conversationId, @PathVariable String turnId) {
        Long userId = CurrentUser.require().userId();
        if (!cancellationRegistry.cancel(turnId, userId)) {
            throw ApiException.notFound("轮次不存在或已结束");
        }
    }

    /** 消息分页：cursor 为上一页返回的 nextCursor（雪花 ID 字符串）。 */
    @GetMapping("/messages")
    public MessagePage messages(@PathVariable Long conversationId,
                                @RequestParam(defaultValue = "20") int limit,
                                @RequestParam(required = false) Long cursor) {
        return turnService.messages(CurrentUser.require().userId(), conversationId, limit, cursor);
    }
}