package com.shenyouchu.core.conversation;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.dto.ConversationView;
import com.shenyouchu.core.conversation.dto.CreateConversationRequest;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
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

    public ConversationService(ConversationMapper conversationMapper,
                               CharacterMapper characterMapper,
                               ActivityService activityService) {
        this.conversationMapper = conversationMapper;
        this.characterMapper = characterMapper;
        this.activityService = activityService;
    }

    @Transactional(readOnly = true)
    public List<ConversationView> list(Long userId) {
        return conversationMapper.selectList(Wrappers.<Conversation>lambdaQuery()
                        .eq(Conversation::getUserId, userId)
                        .orderByDesc(Conversation::getCreatedAt))
                .stream()
                .map(ConversationView::from)
                .toList();
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

    @Transactional
    public void delete(Long userId, Long conversationId) {
        Conversation conversation = requireOwned(userId, conversationId);
        conversationMapper.deleteById(conversation.getId());
        activityService.record(userId, "conversation.deleted", "USER", "core",
                conversationId, null, null, Map.of());
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
