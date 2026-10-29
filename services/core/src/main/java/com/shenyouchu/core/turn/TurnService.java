package com.shenyouchu.core.turn;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.Conversation;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.memory.MemoryService;
import com.shenyouchu.core.memorygraph.MemoryChunkService;
import com.shenyouchu.core.message.Message;
import com.shenyouchu.core.message.dto.MessagePage;
import com.shenyouchu.core.message.dto.MessageView;
import com.shenyouchu.core.message.mapper.MessageMapper;
import com.shenyouchu.core.persona.PersonaService;
import com.shenyouchu.core.relationship.RelationshipService;
import com.shenyouchu.core.relationship.dto.CharacterStateView;
import com.shenyouchu.core.turn.dto.TurnResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class TurnService {

    private static final Logger log = LoggerFactory.getLogger(TurnService.class);

    private final ConversationMapper conversationMapper;
    private final MessageMapper messageMapper;
    private final PersonaService personaService;
    private final ReplyGenerator replyGenerator;
    private final ActivityService activityService;
    private final MemoryService memoryService;
    private final MemoryChunkService memoryChunkService;
    private final RelationshipService relationshipService;
    private final TransactionTemplate transactionTemplate;

    public TurnService(ConversationMapper conversationMapper,
                       MessageMapper messageMapper,
                       PersonaService personaService,
                       ReplyGenerator replyGenerator,
                       ActivityService activityService,
                       MemoryService memoryService,
                       MemoryChunkService memoryChunkService,
                       RelationshipService relationshipService,
                       PlatformTransactionManager transactionManager) {
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.personaService = personaService;
        this.replyGenerator = replyGenerator;
        this.activityService = activityService;
        this.memoryService = memoryService;
        this.memoryChunkService = memoryChunkService;
        this.relationshipService = relationshipService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * 一轮对话：外部模型调用放在事务外，避免慢上游长时间占用连接池；
     * 回复生成后，再把消息、记忆、关系与活动事件放进同一个短事务。
     */
    public TurnResponse send(Long userId, Long conversationId, String text) {
        Conversation conversation = requireOwned(userId, conversationId);
        String turnId = UUID.randomUUID().toString();

        String prompt = personaService.systemPrompt(conversation.getCharacterId());
        String reply = replyGenerator.generate(userId, prompt, text);

        TurnResponse response = transactionTemplate.execute(status ->
                persistTurn(conversation, userId, text, turnId, reply));
        if (response == null) {
            throw new IllegalStateException("事务未返回轮次结果");
        }
        /* 记忆写入与星图刷新是旁路：失败只记日志，不影响本轮回复 */
        try {
            memoryChunkService.recordTurn(userId, conversation.getCharacterId(), conversationId, turnId,
                    Long.valueOf(response.userMessage().id()), response.userMessage().content(),
                    Long.valueOf(response.assistantMessage().id()), response.assistantMessage().content());
        } catch (RuntimeException ex) {
            log.warn("记忆分块写入失败 turn={}: {}", turnId, ex.getMessage());
        }
        return response;
    }

    private TurnResponse persistTurn(Conversation conversation, Long userId, String text,
                                     String turnId, String reply) {
        Long conversationId = conversation.getId();

        Message userMessage = new Message(conversationId, userId, turnId, "user", text);
        messageMapper.insert(userMessage);
        activityService.record(userId, "message.sent", "USER", "core", conversationId, turnId, null,
                Map.of("messageId", String.valueOf(userMessage.getId()), "role", "user"));

        if (memoryService.rememberFromTurn(userId, conversationId, conversation.getCharacterId(),
                userMessage.getId(), text)) {
            activityService.record(userId, "memory.created", "SYSTEM", "core", conversationId, turnId, null,
                    Map.of("sourceMessageId", String.valueOf(userMessage.getId())));
        }

        Message assistantMessage = new Message(conversationId, userId, turnId, "assistant", reply);
        messageMapper.insert(assistantMessage);
        activityService.record(userId, "turn.completed", "AI", "core", conversationId, turnId, null,
                Map.of("messageId", String.valueOf(assistantMessage.getId()), "role", "assistant"));

        conversation.setLastMessageAt(Instant.now());
        conversationMapper.updateById(conversation);

        CharacterStateView state = relationshipService.applyTurn(userId, conversation.getCharacterId(), text);
        activityService.record(userId, "relationship.updated", "SYSTEM", "core", conversationId, turnId, null,
                Map.of("mood", state.mood(), "intimacy", state.intimacy()));

        return new TurnResponse(turnId, MessageView.from(userMessage), MessageView.from(assistantMessage));
    }

    /**
     * 消息分页：默认返回最新一页（按 id 升序返回，界面自上而下时间递增），
     * 带上上一页的 nextCursor 时继续向更早的消息翻页。
     */
    @Transactional(readOnly = true)
    public MessagePage messages(Long userId, Long conversationId, int limit, Long cursor) {
        requireOwned(userId, conversationId);
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        List<Message> rows = messageMapper.selectList(Wrappers.<Message>lambdaQuery()
                .eq(Message::getUserId, userId)
                .eq(Message::getConversationId, conversationId)
                .lt(cursor != null, Message::getId, cursor)
                .orderByDesc(Message::getId)
                .last("LIMIT " + (safeLimit + 1)));

        boolean hasMore = rows.size() > safeLimit;
        List<Message> newestFirst = hasMore ? rows.subList(0, safeLimit) : rows;
        /* 查询按 id 倒序取最新一页，返回前翻正，调用方无需再排序 */
        List<Message> page = new ArrayList<>(newestFirst);
        Collections.reverse(page);
        String nextCursor = hasMore && !page.isEmpty()
                ? String.valueOf(page.get(0).getId())
                : null;
        return new MessagePage(page.stream().map(MessageView::from).toList(), nextCursor);
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
