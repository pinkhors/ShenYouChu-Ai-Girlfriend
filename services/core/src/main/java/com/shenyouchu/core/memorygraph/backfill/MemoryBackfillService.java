package com.shenyouchu.core.memorygraph.backfill;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.conversation.Conversation;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.memorygraph.MemoryChunkService;
import com.shenyouchu.core.memorygraph.MemoryGraphService;
import com.shenyouchu.core.message.Message;
import com.shenyouchu.core.message.mapper.MessageMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 历史消息回填记忆 chunk（文档 08 §21）。
 *
 * <p>按 {@code turn_id} 聚合会话里的历史消息，补写缺失的 chunk；已有 chunk 一律跳过，因此可重复调用。
 * 单次调用最多新建 {@code limit} 个 chunk（默认 200，上限 500），已存在的轮次不占配额，
 * 长会话可以分多次调用逐步补齐。
 *
 * <p>回填不逐轮刷新星图：写 chunk 时传 {@code refreshGraph=false}，全部结束后按 nightly 语义重建一次。
 * 只补 chunk，不补摘要/习惯卡，也不调用 LLM。
 */
@Service
public class MemoryBackfillService {

    private static final Logger log = LoggerFactory.getLogger(MemoryBackfillService.class);

    static final int DEFAULT_LIMIT = 200;
    static final int MAX_LIMIT = 500;

    private static final String REBUILD_MODE = "nightly";
    private static final String ROLE_USER = "user";
    private static final String ROLE_ASSISTANT = "assistant";

    private final ConversationMapper conversationMapper;
    private final MessageMapper messageMapper;
    private final MemoryChunkService chunkService;
    private final MemoryGraphService graphService;

    public MemoryBackfillService(ConversationMapper conversationMapper,
                                 MessageMapper messageMapper,
                                 MemoryChunkService chunkService,
                                 MemoryGraphService graphService) {
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.chunkService = chunkService;
        this.graphService = graphService;
    }

    /**
     * 回填指定用户与角色下的历史对话。
     *
     * @param limit 本次最多新建多少轮 chunk；null/非正数取默认 200，超过 500 按 500 截断
     * @return created 为本次新建 chunk 数，skipped 为被跳过的轮次数（缺消息、空内容或已存在 chunk）
     */
    public BackfillResult backfill(Long userId, Long characterId, Integer limit) {
        if (userId == null || characterId == null) {
            return new BackfillResult(0, 0);
        }
        int maxCreates = effectiveLimit(limit);
        Conversation conversation = findConversation(userId, characterId);
        if (conversation == null) {
            /* 没有会话就没有历史消息；不写 chunk，也不重建快照 */
            return new BackfillResult(0, 0);
        }

        List<Message> messages = messageMapper.selectList(Wrappers.<Message>lambdaQuery()
                .eq(Message::getConversationId, conversation.getId())
                .orderByAsc(Message::getId));

        int created = 0;
        int skipped = 0;
        for (Turn turn : groupTurns(messages)) {
            if (created >= maxCreates) {
                break;
            }
            if (!turn.complete()) {
                skipped++;
                continue;
            }
            if (isBlank(turn.userText()) && isBlank(turn.assistantText())) {
                /* chunk 内容为空时 recordTurn 会直接返回，这里按跳过计数，保持 created 真实 */
                skipped++;
                continue;
            }
            if (chunkService.exists(userId, turn.turnId())) {
                skipped++;
                continue;
            }
            chunkService.recordTurn(userId, characterId, conversation.getId(), turn.turnId(),
                    turn.userMessageId(), turn.userText(),
                    turn.assistantMessageId(), turn.assistantText(),
                    false);
            created++;
        }

        graphService.rebuild(userId, characterId, REBUILD_MODE);
        log.info("记忆回填完成 user={} character={} created={} skipped={}",
                userId, characterId, created, skipped);
        return new BackfillResult(created, skipped);
    }

    static int effectiveLimit(Integer requested) {
        if (requested == null || requested <= 0) {
            return DEFAULT_LIMIT;
        }
        return Math.min(requested, MAX_LIMIT);
    }

    private Conversation findConversation(Long userId, Long characterId) {
        return conversationMapper.selectOne(Wrappers.<Conversation>lambdaQuery()
                .eq(Conversation::getUserId, userId)
                .eq(Conversation::getCharacterId, characterId)
                .last("LIMIT 1"));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /**
     * 按 {@code turn_id} 分组，每组只取一条 user 消息与一条 assistant 消息。
     *
     * <p>同一 turn 内的重复消息保留最先出现的那条（按 message.id 升序读取时即最早写入的那条）；
     * 缺失任一角色的组仍返回，由 {@link Turn#complete()} 标记，交给调用方按“跳过”处理。
     * 结果按组内最早 message.id 升序排列，缺 id 的组排在最后。
     */
    static List<Turn> groupTurns(List<Message> messages) {
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        Map<String, TurnAccumulator> byTurn = new LinkedHashMap<>();
        for (Message message : messages) {
            if (message == null) {
                continue;
            }
            String turnId = message.getTurnId();
            if (turnId == null || turnId.isBlank()) {
                continue;
            }
            byTurn.computeIfAbsent(turnId, TurnAccumulator::new).accept(message);
        }
        List<TurnAccumulator> ordered = new ArrayList<>(byTurn.values());
        ordered.sort(Comparator.comparingLong(TurnAccumulator::sortKey));
        List<Turn> turns = new ArrayList<>(ordered.size());
        for (TurnAccumulator accumulator : ordered) {
            turns.add(accumulator.toTurn());
        }
        return turns;
    }

    /** 回填结果，直接作为接口响应体：{@code {"created":n,"skipped":m}}。 */
    public record BackfillResult(int created, int skipped) {
    }

    /** 一轮对话：user 与 assistant 各一条消息；缺任一条即为不完整。 */
    record Turn(String turnId,
                Long userMessageId, String userText,
                Long assistantMessageId, String assistantText) {

        boolean complete() {
            return userMessageId != null && assistantMessageId != null;
        }
    }

    /** 分组用的可变累加器，避免在分组过程中反复构造不可变对象。 */
    private static final class TurnAccumulator {

        private final String turnId;
        private Long firstMessageId;
        private boolean hasUser;
        private Long userMessageId;
        private String userText;
        private boolean hasAssistant;
        private Long assistantMessageId;
        private String assistantText;

        private TurnAccumulator(String turnId) {
            this.turnId = turnId;
        }

        private void accept(Message message) {
            Long id = message.getId();
            if (id != null && (firstMessageId == null || id < firstMessageId)) {
                firstMessageId = id;
            }
            if (ROLE_USER.equals(message.getRole())) {
                if (hasUser) {
                    return;
                }
                hasUser = true;
                userMessageId = id;
                userText = message.getContent();
            } else if (ROLE_ASSISTANT.equals(message.getRole())) {
                if (hasAssistant) {
                    return;
                }
                hasAssistant = true;
                assistantMessageId = id;
                assistantText = message.getContent();
            }
        }

        private long sortKey() {
            return firstMessageId == null ? Long.MAX_VALUE : firstMessageId;
        }

        private Turn toTurn() {
            return new Turn(turnId, userMessageId, userText, assistantMessageId, assistantText);
        }
    }
}
