package com.shenyouchu.core.conversation;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.dto.ConversationPage;
import com.shenyouchu.core.conversation.dto.ConversationView;
import com.shenyouchu.core.conversation.dto.CreateConversationRequest;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.memory.Memory;
import com.shenyouchu.core.memory.mapper.MemoryMapper;
import com.shenyouchu.core.message.Message;
import com.shenyouchu.core.message.mapper.MessageMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
public class ConversationService {

    private static final String DEFAULT_CHARACTER_CODE = "shenyouchu";

    private final ConversationMapper conversationMapper;
    private final CharacterMapper characterMapper;
    private final ActivityService activityService;
    private final MessageMapper messageMapper;
    private final MemoryMapper memoryMapper;

    public ConversationService(ConversationMapper conversationMapper,
                               CharacterMapper characterMapper,
                               ActivityService activityService,
                               MessageMapper messageMapper,
                               MemoryMapper memoryMapper) {
        this.conversationMapper = conversationMapper;
        this.characterMapper = characterMapper;
        this.activityService = activityService;
        this.messageMapper = messageMapper;
        this.memoryMapper = memoryMapper;
    }

    /** 会话分页：按 id 降序（最新在前），取 limit+1 判断是否还有下一页。 */
    @Transactional(readOnly = true)
    public ConversationPage list(Long userId, int limit, Long cursor) {
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        List<Conversation> rows = conversationMapper.selectList(Wrappers.<Conversation>lambdaQuery()
                .eq(Conversation::getUserId, userId)
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

    @Transactional
    public ConversationView create(Long userId, CreateConversationRequest request) {
        Long characterId = resolveCharacterId(request.characterId());
        Conversation conversation = new Conversation(
                userId,
                characterId,
                request.title());
        conversationMapper.insert(conversation);
        activityService.record(userId, "conversation.created", "USER", "core",
                conversation.getId(), null, null, Map.of("characterId", String.valueOf(characterId)));
        return ConversationView.from(conversation);
    }

    @Transactional(readOnly = true)
    public ConversationView get(Long userId, Long conversationId) {
        return ConversationView.from(requireOwned(userId, conversationId));
    }

    /** 删除会话时级联逻辑删除该会话的消息与记忆，避免残留孤立数据。 */
    @Transactional
    public void delete(Long userId, Long conversationId) {
        Conversation conversation = requireOwned(userId, conversationId);
        int messages = messageMapper.delete(Wrappers.<Message>lambdaQuery()
                .eq(Message::getUserId, userId)
                .eq(Message::getConversationId, conversationId));
        int memories = memoryMapper.delete(Wrappers.<Memory>lambdaQuery()
                .eq(Memory::getUserId, userId)
                .eq(Memory::getConversationId, conversationId));
        conversationMapper.deleteById(conversation.getId());
        activityService.record(userId, "conversation.deleted", "USER", "core",
                conversationId, null, null, Map.of("messages", messages, "memories", memories));
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

    /** 角色 ID 对外是字符串；非数字输入视为非法参数，不落到数据库查询。 */
    private Long resolveCharacterId(String requested) {
        if (requested != null && !requested.isBlank()) {
            long characterId;
            try {
                characterId = Long.parseLong(requested.trim());
            } catch (NumberFormatException ex) {
                throw ApiException.validation("角色 ID 格式不正确");
            }
            CharacterProfile character = characterMapper.selectById(characterId);
            if (character == null) {
                throw ApiException.validation("角色不存在");
            }
            return character.getId();
        }
        CharacterProfile fallback = characterMapper.selectOne(Wrappers.<CharacterProfile>lambdaQuery()
                .eq(CharacterProfile::getCode, DEFAULT_CHARACTER_CODE));
        if (fallback == null) {
            throw ApiException.notFound("默认角色未初始化，请先执行数据库迁移");
        }
        return fallback.getId();
    }
}
