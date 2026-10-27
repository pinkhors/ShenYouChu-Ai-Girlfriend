package com.shenyouchu.core.conversation;

import com.shenyouchu.core.conversation.dto.ConversationView;
import com.shenyouchu.core.conversation.dto.CreateConversationRequest;
import com.shenyouchu.core.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/conversations")
public class ConversationController {

    private final ConversationService conversationService;

    public ConversationController(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    @GetMapping
    public List<ConversationView> list() {
        return conversationService.list(CurrentUser.require().userId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConversationView create(@Valid @RequestBody CreateConversationRequest request) {
        return conversationService.create(CurrentUser.require().userId(), request);
    }

    @GetMapping("/{id}")
    public ConversationView get(@PathVariable Long id) {
        return conversationService.get(CurrentUser.require().userId(), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        conversationService.delete(CurrentUser.require().userId(), id);
    }
}
