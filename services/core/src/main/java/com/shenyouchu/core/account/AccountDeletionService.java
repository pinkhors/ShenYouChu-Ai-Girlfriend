package com.shenyouchu.core.account;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.auth.UserSession;
import com.shenyouchu.core.auth.mapper.UserSessionMapper;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.character.mapper.UserPreferenceMapper;
import com.shenyouchu.core.conversation.Conversation;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.llm.settings.mapper.UserLlmSettingsMapper;
import com.shenyouchu.core.memory.Memory;
import com.shenyouchu.core.memory.mapper.MemoryMapper;
import com.shenyouchu.core.message.Message;
import com.shenyouchu.core.message.mapper.MessageMapper;
import com.shenyouchu.core.relationship.UserCharacterState;
import com.shenyouchu.core.relationship.mapper.UserCharacterStateMapper;
import com.shenyouchu.core.user.User;
import com.shenyouchu.core.user.mapper.UserMapper;
import com.shenyouchu.core.voice.provider.VoiceCredential;
import com.shenyouchu.core.voice.provider.VoiceCredentialMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * 账号删除：MySQL 内所有用户数据逻辑删除 + 活跃会话立即失效，
 * 派生存储通过 {@link AccountPurgePort} 扩展；删除过程写入活动事件（保留最小审计）。
 *
 * <p>角色矩阵：自定义角色与 user_preferences 一并清理；官方角色（owner_user_id 为 NULL）保留。
 */
@Service
public class AccountDeletionService {

    private final UserMapper userMapper;
    private final UserSessionMapper userSessionMapper;
    private final ConversationMapper conversationMapper;
    private final MessageMapper messageMapper;
    private final MemoryMapper memoryMapper;
    private final UserCharacterStateMapper stateMapper;
    private final UserLlmSettingsMapper llmSettingsMapper;
    private final VoiceCredentialMapper voiceCredentialMapper;
    private final CharacterMapper characterMapper;
    private final UserPreferenceMapper preferenceMapper;
    private final ActivityService activityService;
    private final List<AccountPurgePort> purgePorts;

    public AccountDeletionService(UserMapper userMapper,
                                  UserSessionMapper userSessionMapper,
                                  ConversationMapper conversationMapper,
                                  MessageMapper messageMapper,
                                  MemoryMapper memoryMapper,
                                  UserCharacterStateMapper stateMapper,
                                  UserLlmSettingsMapper llmSettingsMapper,
                                  VoiceCredentialMapper voiceCredentialMapper,
                                  CharacterMapper characterMapper,
                                  UserPreferenceMapper preferenceMapper,
                                  ActivityService activityService,
                                  List<AccountPurgePort> purgePorts) {
        this.userMapper = userMapper;
        this.userSessionMapper = userSessionMapper;
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.memoryMapper = memoryMapper;
        this.stateMapper = stateMapper;
        this.llmSettingsMapper = llmSettingsMapper;
        this.voiceCredentialMapper = voiceCredentialMapper;
        this.characterMapper = characterMapper;
        this.preferenceMapper = preferenceMapper;
        this.activityService = activityService;
        this.purgePorts = purgePorts;
    }

    @Transactional
    public void deleteAccount(Long userId) {
        activityService.record(userId, "data.deletion_requested", "USER", "core", null, null, null, Map.of());

        int sessions = userSessionMapper.delete(Wrappers.<UserSession>lambdaQuery()
                .eq(UserSession::getUserId, userId));
        int messages = messageMapper.delete(Wrappers.<Message>lambdaQuery()
                .eq(Message::getUserId, userId));
        int memories = memoryMapper.delete(Wrappers.<Memory>lambdaQuery()
                .eq(Memory::getUserId, userId));
        int conversations = conversationMapper.delete(Wrappers.<Conversation>lambdaQuery()
                .eq(Conversation::getUserId, userId));
        int states = stateMapper.delete(Wrappers.<UserCharacterState>lambdaQuery()
                .eq(UserCharacterState::getUserId, userId));
        int llmSettings = llmSettingsMapper.deleteById(userId);
        /* 语音 BYOK 凭据物理删除：密文随账号一起清除，不保留。 */
        int voiceCredentials = voiceCredentialMapper.delete(Wrappers.<VoiceCredential>lambdaQuery()
                .eq(VoiceCredential::getUserId, userId));
        /* 只删自定义角色；官方角色 owner_user_id 为 NULL，不会被匹配。 */
        int characters = characterMapper.delete(Wrappers.<CharacterProfile>lambdaQuery()
                .eq(CharacterProfile::getOwnerUserId, userId));
        int preferences = preferenceMapper.deleteById(userId);

        User user = userMapper.selectById(userId);
        if (user != null) {
            user.setStatus("deleted");
            userMapper.updateById(user);
            userMapper.deleteById(userId);
        }

        for (AccountPurgePort port : purgePorts) {
            port.purge(userId);
        }

        activityService.record(userId, "data.deletion_completed", "SYSTEM", "core", null, null, null,
                Map.of("sessions", sessions, "messages", messages, "memories", memories,
                        "conversations", conversations, "states", states, "llmSettings", llmSettings,
                        "voiceCredentials", voiceCredentials,
                        "characters", characters, "preferences", preferences));
    }
}
