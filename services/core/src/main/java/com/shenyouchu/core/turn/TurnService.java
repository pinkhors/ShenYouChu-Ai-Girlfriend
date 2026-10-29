package com.shenyouchu.core.turn;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.CharacterExpressionService;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.Conversation;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.memory.MemoryService;
import com.shenyouchu.core.memorygraph.MemoryChunkService;
import com.shenyouchu.core.memorygraph.retrieval.MemoryContext;
import com.shenyouchu.core.memorygraph.retrieval.MemoryRecallService;
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

    /** 普通回复上下文（文档 09 §8.6）：最近对话 10 条。 */
    private static final int RECENT_MESSAGE_LIMIT = 10;

    private final ConversationMapper conversationMapper;
    private final MessageMapper messageMapper;
    private final PersonaService personaService;
    private final ReplyGenerator replyGenerator;
    private final ActivityService activityService;
    private final MemoryService memoryService;
    private final MemoryChunkService memoryChunkService;
    private final MemoryRecallService memoryRecallService;
    private final RelationshipService relationshipService;
    private final CharacterMapper characterMapper;
    private final CharacterExpressionService expressionService;
    private final TransactionTemplate transactionTemplate;
    private final TurnContextAssembler contextAssembler = new TurnContextAssembler();

    public TurnService(ConversationMapper conversationMapper,
                       MessageMapper messageMapper,
                       PersonaService personaService,
                       ReplyGenerator replyGenerator,
                       ActivityService activityService,
                       MemoryService memoryService,
                       MemoryChunkService memoryChunkService,
                       MemoryRecallService memoryRecallService,
                       RelationshipService relationshipService,
                       CharacterMapper characterMapper,
                       CharacterExpressionService expressionService,
                       PlatformTransactionManager transactionManager) {
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.personaService = personaService;
        this.replyGenerator = replyGenerator;
        this.activityService = activityService;
        this.memoryService = memoryService;
        this.memoryChunkService = memoryChunkService;
        this.memoryRecallService = memoryRecallService;
        this.relationshipService = relationshipService;
        this.characterMapper = characterMapper;
        this.expressionService = expressionService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * 一轮对话：外部模型调用放在事务外，避免慢上游长时间占用连接池；
     * 回复生成后，再把消息、记忆、关系与活动事件放进同一个短事务。
     *
     * <p>采样温度：自定义角色用角色级生效温度；官方角色/旧数据得到 NaN，
     * 由生成器回退到用户级配置，行为与历史一致（文档 09 §7）。
     */
    public TurnResponse send(Long userId, Long conversationId, String text) {
        Conversation conversation = requireOwned(userId, conversationId);
        String turnId = UUID.randomUUID().toString();

        String prompt = personaService.systemPrompt(conversation.getCharacterId());
        double temperature = replyTemperature(conversation);
        String context = buildContext(userId, conversation, text, turnId);
        String reply = replyGenerator.generate(userId, conversation.getCharacterId(), prompt, context,
                text, temperature);

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

    /**
     * 组装普通回复上下文（文档 09 §8.6 / AC-16、AC-17）。
     *
     * <p>最近对话、记忆、关系状态分别读取，任一部分失败只记 warn 并跳过，
     * 回复链路不因此失败。所有查询都在事务外执行，与“模型调用在事务外”一致。
     */
    private String buildContext(Long userId, Conversation conversation, String text, String turnId) {
        Long conversationId = conversation.getId();
        Long characterId = conversation.getCharacterId();

        List<Message> recentMessages = recentMessages(userId, conversationId);
        MemoryContext memory = MemoryContext.empty("empty", false);
        if (characterId != null) {
            try {
                memory = memoryRecallService.recall(userId, characterId, text, turnId);
                if (memory == null) {
                    memory = MemoryContext.empty("empty", false);
                }
            } catch (RuntimeException ex) {
                log.warn("记忆召回失败，本轮只带最近对话 character={}: {}", characterId, ex.getMessage());
            }
        }

        Integer mood = null;
        Integer intimacy = null;
        if (characterId != null) {
            try {
                CharacterStateView state = relationshipService.view(userId, characterId);
                mood = state.mood();
                intimacy = state.intimacy();
            } catch (RuntimeException ex) {
                log.warn("读取关系状态失败 conversation={}: {}", conversationId, ex.getMessage());
            }
        }
        return contextAssembler.assembleMemory(recentMessages, memory, mood, intimacy,
                Instant.now(), conversation.getCreatedAt());
    }

    /** 当前会话最近 10 条消息，按 id 倒序取再翻正为时间升序；不含本轮尚未落库的输入。 */
    private List<Message> recentMessages(Long userId, Long conversationId) {
        try {
            List<Message> newestFirst = messageMapper.selectList(Wrappers.<Message>lambdaQuery()
                    .eq(Message::getUserId, userId)
                    .eq(Message::getConversationId, conversationId)
                    .orderByDesc(Message::getId)
                    .last("LIMIT " + RECENT_MESSAGE_LIMIT));
            if (newestFirst == null || newestFirst.isEmpty()) {
                return List.of();
            }
            List<Message> ascending = new ArrayList<>(newestFirst);
            Collections.reverse(ascending);
            return ascending;
        } catch (RuntimeException ex) {
            log.warn("读取最近对话失败 conversation={}: {}", conversationId, ex.getMessage());
            return List.of();
        }
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

    /** 角色级温度：官方角色、缺失角色返回 NaN，生成器据此回退到用户级温度。 */
    private double replyTemperature(Conversation conversation) {
        Long characterId = conversation.getCharacterId();
        if (characterId == null) {
            return Double.NaN;
        }
        CharacterProfile character = characterMapper.selectById(characterId);
        return expressionService.replyTemperature(character);
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
