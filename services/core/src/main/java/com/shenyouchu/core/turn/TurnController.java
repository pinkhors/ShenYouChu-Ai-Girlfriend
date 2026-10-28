package com.shenyouchu.core.turn;

import com.shenyouchu.core.message.dto.MessageView;
import com.shenyouchu.core.security.CurrentUser;
import com.shenyouchu.core.turn.dto.TurnRequest;
import com.shenyouchu.core.turn.dto.TurnResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}")
public class TurnController {

    private final TurnService turnService;

    public TurnController(TurnService turnService) {
        this.turnService = turnService;
    }

    @PostMapping("/turns")
    public TurnResponse send(@PathVariable Long conversationId, @Valid @RequestBody TurnRequest request) {
        return turnService.send(CurrentUser.require().userId(), conversationId, request.message().trim());
    }

    @GetMapping("/messages")
    public List<MessageView> messages(@PathVariable Long conversationId) {
        return turnService.messages(CurrentUser.require().userId(), conversationId);
    }
}
