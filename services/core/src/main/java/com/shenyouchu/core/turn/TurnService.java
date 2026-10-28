package com.shenyouchu.core.turn;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.Conversation;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.memory.MemoryService;
import com.shenyouchu.core.message.Message;
import com.shenyouchu.core.message.dto.MessageView;
import com.shenyouchu.core.message.mapper.MessageMapper;
import com.shenyouchu.core.persona.PersonaService;
import com.shenyouchu.core.turn.dto.TurnResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class TurnService {

    private final ConversationMapper conversationMapper;
    private final MessageMapper messageMapper;
    private final PersonaService personaService;
    private final ReplyGenerator replyGenerator;
    private final ActivityService activityService;
    private final MemoryService memoryService;

    public TurnService(ConversationMapper conversationMapper,
                       MessageMapper messageMapper,
                       PersonaService personaService,
                       ReplyGenerator replyGenerator,
                       ActivityService activityService,
                       MemoryService memoryService) {
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.personaService = personaService;
        this.replyGenerator = replyGenerator;
        this.activityService = activityService;
        this.memoryService = memoryService;
    }

    @Transactional
    public TurnResponse send(Long userId, Long conversationId, String text) {
        Conversation conversation = requireOwned(userId, conversationId);
        String turnId = UUID.randomUUID().toString();

        Message userMessage = new Message(conversationId, userId, turnId, "user", text);
        messageMapper.insert(userMessage);
        activityService.record(userId, "message.sent", "USER", "core", conversationId, turnId, null,
                Map.of("messageId", String.valueOf(userMessage.getId()), "role", "user"));

        if (memoryService.rememberFromTurn(userId, conversationId, userMessage.getId(), text)) {
            activityService.record(userId, "memory.created", "SYSTEM", "core", conversationId, turnId, null,
                    Map.of("sourceMessageId", String.valueOf(userMessage.getId())));
        }

        String prompt = personaService.systemPrompt(conversation.getCharacterId());
        String reply = replyGenerator.generate(prompt, text);

        Message assistantMessage = new Message(conversationId, userId, turnId, "assistant", reply);
        messageMapper.insert(assistantMessage);
        activityService.record(userId, "turn.completed", "AI", "core", conversationId, turnId, null,
                Map.of("messageId", String.valueOf(assistantMessage.getId()), "role", "assistant"));

        conversation.setLastMessageAt(Instant.now());
        conversationMapper.updateById(conversation);

        return new TurnResponse(turnId, MessageView.from(userMessage), MessageView.from(assistantMessage));
    }

    @Transactional(readOnly = true)
    public List<MessageView> messages(Long userId, Long conversationId) {
        requireOwned(userId, conversationId);
        return messageMapper.selectList(Wrappers.<Message>lambdaQuery()
                        .eq(Message::getUserId, userId)
                        .eq(Message::getConversationId, conversationId)
                        .orderByAsc(Message::getCreatedAt))
                .stream()
                .map(MessageView::from)
                .toList();
    }

    /** 归属校验：查不到或不属于当前用户都返回 404。 */
    private Conversation requireOwned(Long userId, Long conversationId) {
        Conversation conversation = conversationMapper.selectOne(Wrappers.<Conversation>lambdaQuery()
                .eq(Conversation::getId, conversationId)
                .eq(Conversation::getUserId, userId));
        if (conversation == null) {
            throw ApiException.notFound("会话不存在");
        }
        return conversation;
    }
}
