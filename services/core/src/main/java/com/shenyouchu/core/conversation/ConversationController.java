package com.shenyouchu.core.conversation;

import com.shenyouchu.core.conversation.dto.ConversationPage;
import com.shenyouchu.core.conversation.dto.ConversationView;
import com.shenyouchu.core.conversation.dto.CreateConversationRequest;
import com.shenyouchu.core.conversation.dto.EnsureConversationResult;
import com.shenyouchu.core.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/conversations")
public class ConversationController {

    private final ConversationService conversationService;

    public ConversationController(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    /** 会话分页：按 id 降序（最新在前），cursor 为上一页 nextCursor；characterId 可选筛选。 */
    @GetMapping
    public ConversationPage list(@RequestParam(defaultValue = "20") int limit,
                                 @RequestParam(required = false) Long cursor,
                                 @RequestParam(required = false) String characterId) {
        return conversationService.list(CurrentUser.require().userId(), limit, cursor, characterId);
    }

    /**
     * 幂等创建会话：已存在返回 200 + 已有会话；本次新建返回 201 + 新会话。
     * 请求体仍可传 characterId；title 已废弃并被忽略。
     */
    @PostMapping
    public ResponseEntity<ConversationView> create(
            @Valid @RequestBody(required = false) CreateConversationRequest request) {
        EnsureConversationResult result =
                conversationService.create(CurrentUser.require().userId(), request);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(result.conversation());
    }

    @GetMapping("/{id}")
    public ConversationView get(@PathVariable Long id) {
        return conversationService.get(CurrentUser.require().userId(), id);
    }

    /** 清空聊天记录（逻辑删除消息/记忆），会话行保留。 */
    @PostMapping("/{id}/clear")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clear(@PathVariable Long id) {
        conversationService.clear(CurrentUser.require().userId(), id);
    }

    /** 会话不允许删除；服务层抛出 409 CONVERSATION_DELETE_NOT_ALLOWED。 */
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        conversationService.delete(CurrentUser.require().userId(), id);
    }
}
