package com.shenyouchu.core.conversation;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.CharacterService;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.dto.ConversationPage;
import com.shenyouchu.core.conversation.dto.ConversationView;
import com.shenyouchu.core.conversation.dto.CreateConversationRequest;
import com.shenyouchu.core.conversation.dto.EnsureConversationResult;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.memory.Memory;
import com.shenyouchu.core.memory.mapper.MemoryMapper;
import com.shenyouchu.core.memorygraph.MemoryGraphPurgeService;
import com.shenyouchu.core.message.Message;
import com.shenyouchu.core.message.mapper.MessageMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * 会话读写。每个 (user_id, character_id) 只有一条会话：
 * <ul>
 *   <li>列表查询前先为可见且 active 的角色幂等补建；</li>
 *   <li>POST 创建改为 ensure 语义，已存在返回已有会话；</li>
 *   <li>会话不允许删除，只能清空聊天记录（会话行保留）。</li>
 * </ul>
 */
@Service
public class ConversationService {

    private static final String CODE_DELETE_NOT_ALLOWED = "CONVERSATION_DELETE_NOT_ALLOWED";

    private final ConversationMapper conversationMapper;
    private final CharacterService characterService;
    private final ConversationProvisioner conversationProvisioner;
    private final ActivityService activityService;
    private final MessageMapper messageMapper;
    private final MemoryMapper memoryMapper;
    private final MemoryGraphPurgeService graphPurgeService;

    public ConversationService(ConversationMapper conversationMapper,
                               CharacterService characterService,
                               ConversationProvisioner conversationProvisioner,
                               ActivityService activityService,
                               MessageMapper messageMapper,
                               MemoryMapper memoryMapper,
                               MemoryGraphPurgeService graphPurgeService) {
        this.conversationMapper = conversationMapper;
        this.characterService = characterService;
        this.conversationProvisioner = conversationProvisioner;
        this.activityService = activityService;
        this.messageMapper = messageMapper;
        this.memoryMapper = memoryMapper;
        this.graphPurgeService = graphPurgeService;
    }

    /**
     * 会话分页：按 id 降序（最新在前），取 limit+1 判断是否还有下一页。
     * characterId 可选，用于只看某个角色的会话；结果始终限定在当前用户内。
     *
     * <p>查询前补建：官方/存量角色首次加载、账号历史数据缺失会话时，列表仍能稳定返回。
     * 该方法会写数据库，因此不能标记为 readOnly。
     */
    @Transactional
    public ConversationPage list(Long userId, int limit, Long cursor, String characterId) {
        conversationProvisioner.ensureForActiveCharacters(userId);
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        Long characterFilter = characterId == null || characterId.isBlank()
                ? null
                : characterService.parseCharacterId(characterId);
        List<Conversation> rows = conversationMapper.selectList(Wrappers.<Conversation>lambdaQuery()
                .eq(Conversation::getUserId, userId)
                .eq(characterFilter != null, Conversation::getCharacterId, characterFilter)
                .lt(cursor != null, Conversation::getId, cursor)
                .orderByDesc(Conversation::getId)
                .last("LIMIT " + (safeLimit + 1)));

        boolean hasMore = rows.size() > safeLimit;
        List<Conversation> page = hasMore ? rows.subList(0, safeLimit) : rows;
        String nextCursor = hasMore && !page.isEmpty()
                ? String.valueOf(page.get(page.size() - 1).getId())
                : null;
        return new ConversationPage(page.stream().map(ConversationView::from).toList(), nextCursor);
    }

    /**
     * 幂等创建：每个 (userId, characterId) 只会有唯一会话。
     * 已存在返回已有会话 + created=false；新建返回 created=true。
     * 请求中的 title 已废弃，不再写入。
     */
    @Transactional
    public EnsureConversationResult create(Long userId, CreateConversationRequest request) {
        /* 不传 characterId 用当前角色；显式传入必须是官方或本人所有，归档角色 409。 */
        Long characterId = characterService.resolveConversationCharacter(
                userId, request == null ? null : request.characterId());
        CharacterProfile character = characterService.requireVisible(userId, characterId);
        ConversationProvisioner.ProvisionedConversation provisioned =
                conversationProvisioner.ensureWithCreated(userId, character);
        return new EnsureConversationResult(
                ConversationView.from(provisioned.conversation()), provisioned.created());
    }

    @Transactional(readOnly = true)
    public ConversationView get(Long userId, Long conversationId) {
        return ConversationView.from(requireOwned(userId, conversationId));
    }

    /**
     * 清空聊天记录：逻辑删除该会话的消息与记忆，并把会话标题、最后消息时间置空。
     * 会话行本身保留，符合“一对一角色只有一条会话”的约束。
     */
    @Transactional
    public void clear(Long userId, Long conversationId) {
        Conversation conversation = requireOwned(userId, conversationId);
        int messages = messageMapper.delete(Wrappers.<Message>lambdaQuery()
                .eq(Message::getUserId, userId)
                .eq(Message::getConversationId, conversationId));
        int memories = memoryMapper.delete(Wrappers.<Memory>lambdaQuery()
                .eq(Memory::getUserId, userId)
                .eq(Memory::getConversationId, conversationId));
        graphPurgeService.purgeConversation(userId, conversationId);

        /* updateById 默认忽略 null 字段，必须用 UpdateWrapper 显式清空 title/last_message_at。 */
        conversationMapper.update(null, Wrappers.<Conversation>lambdaUpdate()
                .eq(Conversation::getId, conversation.getId())
                .eq(Conversation::getUserId, userId)
                .set(Conversation::getLastMessageAt, null)
                .set(Conversation::getTitle, null)
                .set(Conversation::getUpdatedAt, Instant.now()));

        activityService.record(userId, "conversation.cleared", "USER", "core",
                conversationId, null, null, Map.of("messages", messages, "memories", memories));
    }

    /**
     * 会话不再支持删除（每个角色必须保留唯一会话），调用方应改用 {@link #clear(Long, Long)}。
     * 保留方法是为了让 DELETE /conversations/{id} 明确返回 409 与稳定错误码。
     */
    public void delete(Long userId, Long conversationId) {
        /* 先做归属校验：他人或不存在的会话仍按 404 处理，不泄露存在性。 */
        requireOwned(userId, conversationId);
        throw ApiException.conflict(CODE_DELETE_NOT_ALLOWED,
                "会话不支持删除，请使用清空聊天记录。");
    }

    /** 归属校验：查不到或不属于当前用户都返回 404，避免泄露资源存在性。 */
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
