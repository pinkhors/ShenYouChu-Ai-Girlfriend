package com.shenyouchu.core.conversation;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * 用户-角色会话的唯一补建入口。
 *
 * <p>每个 (user_id, character_id) 只允许一条会话：角色创建/复制、首次加载、切换当前角色、
 * 会话列表都会经过这里。并发创建由数据库唯一键兜底，捕获 {@link DuplicateKeyException}
 * 后回查已有会话。依赖仅限 {@link ConversationMapper}、{@link ActivityService} 和
 * {@link CharacterMapper}，避免与 CharacterService 形成循环依赖。
 */
@Service
public class ConversationProvisioner {

    /** 与 CharacterService.STATUS_ACTIVE 保持一致；此处不反向依赖 CharacterService。 */
    private static final String STATUS_ACTIVE = "active";

    private final ConversationMapper conversationMapper;
    private final ActivityService activityService;
    private final CharacterMapper characterMapper;

    public ConversationProvisioner(ConversationMapper conversationMapper,
                                   ActivityService activityService,
                                   CharacterMapper characterMapper) {
        this.conversationMapper = conversationMapper;
        this.activityService = activityService;
        this.characterMapper = characterMapper;
    }

    /** 幂等确保会话存在；仅新建时记录 conversation.created。 */
    @Transactional
    public Conversation ensure(Long userId, CharacterProfile character) {
        return ensureWithCreated(userId, character).conversation();
    }

    /** 与 {@link #ensure(Long, CharacterProfile)} 相同，额外返回本次是否真的新建了会话。 */
    @Transactional
    public ProvisionedConversation ensureWithCreated(Long userId, CharacterProfile character) {
        Long characterId = character == null ? null : character.getId();
        if (userId == null || characterId == null) {
            throw new IllegalArgumentException("userId 与 character 均不能为空");
        }
        Conversation existing = find(userId, characterId);
        if (existing != null) {
            return new ProvisionedConversation(existing, false);
        }

        Conversation conversation = new Conversation(userId, characterId, null);
        try {
            conversationMapper.insert(conversation);
        } catch (DuplicateKeyException ex) {
            /* 并发插入时另一个事务已创建：回查并复用，不重复记录 created 事件。
               FOR UPDATE 使用当前读，避免 REPEATABLE READ 快照看不到刚提交的会话。 */
            Conversation concurrent = findForUpdate(userId, characterId);
            if (concurrent != null) {
                return new ProvisionedConversation(concurrent, false);
            }
            throw ex;
        }
        activityService.record(userId, "conversation.created", "USER", "core",
                conversation.getId(), null, null, Map.of("characterId", String.valueOf(characterId)));
        return new ProvisionedConversation(conversation, true);
    }

    /**
     * 为当前用户可见且 active 的角色补齐会话。
     * 可见语义与角色列表保持一致：官方（owner 为 NULL）、本人角色、以及 is_public 的存量角色；
     * 归档角色不补建，但已有会话仍可继续使用。
     */
    @Transactional
    public void ensureForActiveCharacters(Long userId) {
        List<CharacterProfile> characters = characterMapper.selectList(Wrappers.<CharacterProfile>lambdaQuery()
                .and(wrapper -> wrapper.isNull(CharacterProfile::getOwnerUserId)
                        .or().eq(CharacterProfile::getPublicVisible, true)
                        .or().eq(CharacterProfile::getOwnerUserId, userId))
                .eq(CharacterProfile::getStatus, STATUS_ACTIVE)
                .orderByAsc(CharacterProfile::getCreatedAt));
        for (CharacterProfile character : characters) {
            ensure(userId, character);
        }
    }

    private Conversation find(Long userId, Long characterId) {
        return conversationMapper.selectOne(Wrappers.<Conversation>lambdaQuery()
                .eq(Conversation::getUserId, userId)
                .eq(Conversation::getCharacterId, characterId)
                .last("LIMIT 1"));
    }

    private Conversation findForUpdate(Long userId, Long characterId) {
        return conversationMapper.selectOne(Wrappers.<Conversation>lambdaQuery()
                .eq(Conversation::getUserId, userId)
                .eq(Conversation::getCharacterId, characterId)
                .last("LIMIT 1 FOR UPDATE"));
    }

    /** 会话与“是否本次新建”的组合结果，供 POST /conversations 决定 200/201。 */
    public record ProvisionedConversation(Conversation conversation, boolean created) {
    }
}
