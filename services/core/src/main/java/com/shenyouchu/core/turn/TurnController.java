package com.shenyouchu.core.turn;

import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.message.dto.MessageView;
import com.shenyouchu.core.security.CurrentUser;
import com.shenyouchu.core.turn.dto.TurnRequest;
import com.shenyouchu.core.turn.dto.TurnResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}")
public class TurnController {

    private final TurnService turnService;
    private final TurnCancellationRegistry cancellationRegistry;

    public TurnController(TurnService turnService, TurnCancellationRegistry cancellationRegistry) {
        this.turnService = turnService;
        this.cancellationRegistry = cancellationRegistry;
    }

    @PostMapping("/turns")
    public TurnResponse send(@PathVariable Long conversationId, @Valid @RequestBody TurnRequest request) {
        return turnService.send(CurrentUser.require().userId(), conversationId, request.message().trim());
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

    @GetMapping("/messages")
    public List<MessageView> messages(@PathVariable Long conversationId) {
        return turnService.messages(CurrentUser.require().userId(), conversationId);
    }
}
