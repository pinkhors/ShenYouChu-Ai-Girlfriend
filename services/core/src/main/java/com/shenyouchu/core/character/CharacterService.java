package com.shenyouchu.core.character;

import com.baomidou.mybatisplus.core.incrementer.IdentifierGenerator;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.dto.ActiveCharacterResponse;
import com.shenyouchu.core.character.dto.CharacterMutationResult;
import com.shenyouchu.core.character.dto.CharacterPurgeResult;
import com.shenyouchu.core.character.dto.CharacterView;
import com.shenyouchu.core.character.dto.CreateCharacterRequest;
import com.shenyouchu.core.character.dto.DuplicateCharacterRequest;
import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;
import com.shenyouchu.core.character.dto.UpdateCharacterRequest;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.character.mapper.UserPreferenceMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.Conversation;
import com.shenyouchu.core.conversation.ConversationProvisioner;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.memory.mapper.MemoryMapper;
import com.shenyouchu.core.message.mapper.MessageMapper;
import com.shenyouchu.core.relationship.mapper.UserCharacterStateMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 角色卡读写与生命周期（文档 §5.4 / §5.6）。
 *
 * <p>权限规则：
 * <ul>
 *   <li>官方角色（owner_user_id 为 NULL）所有人可读，人设只读；写操作 403 CHARACTER_READONLY。</li>
 *   <li>自定义角色仅本人可读/写；他人角色统一 404 CHARACTER_NOT_FOUND，不泄露存在性。</li>
 * </ul>
 * <p>写操作全部从认证上下文取 userId，不接受客户端传入 owner。
 */
@Service
public class CharacterService {

    public static final String DEFAULT_CHARACTER_CODE = "shenyouchu";
    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_ARCHIVED = "archived";

    private static final String CODE_NOT_FOUND = "CHARACTER_NOT_FOUND";
    private static final String CODE_READONLY = "CHARACTER_READONLY";
    private static final String CODE_NAME_TAKEN = "CHARACTER_NAME_TAKEN";
    private static final String CODE_LIMIT_REACHED = "CHARACTER_LIMIT_REACHED";
    private static final String CODE_VERSION_CONFLICT = "CHARACTER_VERSION_CONFLICT";
    private static final String CODE_ARCHIVED = "CHARACTER_ARCHIVED";
    private static final String CODE_OPTION_INVALID = "CHARACTER_OPTION_INVALID";

    private final CharacterMapper characterMapper;
    private final UserPreferenceMapper preferenceMapper;
    private final ConversationMapper conversationMapper;
    private final ConversationProvisioner conversationProvisioner;
    private final MessageMapper messageMapper;
    private final MemoryMapper memoryMapper;
    private final UserCharacterStateMapper stateMapper;
    private final ActivityService activityService;
    private final CharacterValidator validator;
    private final ObjectMapper objectMapper;
    private final IdentifierGenerator identifierGenerator;

    public CharacterService(CharacterMapper characterMapper,
                            UserPreferenceMapper preferenceMapper,
                            ConversationMapper conversationMapper,
                            ConversationProvisioner conversationProvisioner,
                            MessageMapper messageMapper,
                            MemoryMapper memoryMapper,
                            UserCharacterStateMapper stateMapper,
                            ActivityService activityService,
                            CharacterValidator validator,
                            ObjectMapper objectMapper,
                            IdentifierGenerator identifierGenerator) {
        this.characterMapper = characterMapper;
        this.preferenceMapper = preferenceMapper;
        this.conversationMapper = conversationMapper;
        this.conversationProvisioner = conversationProvisioner;
        this.messageMapper = messageMapper;
        this.memoryMapper = memoryMapper;
        this.stateMapper = stateMapper;
        this.activityService = activityService;
        this.validator = validator;
        this.objectMapper = objectMapper;
        this.identifierGenerator = identifierGenerator;
    }

    /** 官方 + 当前用户自定义；官方始终返回，归档只作用于自定义角色。 */
    @Transactional(readOnly = true)
    public List<CharacterView> list(Long userId, boolean includeArchived) {
        Long activeId = activeCharacterId(userId);
        List<CharacterProfile> rows = characterMapper.selectList(Wrappers.<CharacterProfile>lambdaQuery()
                .and(wrapper -> wrapper.isNull(CharacterProfile::getOwnerUserId)
                        .or().eq(CharacterProfile::getPublicVisible, true)
                        .or().eq(CharacterProfile::getOwnerUserId, userId))
                .orderByAsc(CharacterProfile::getOwnerUserId)
                .orderByAsc(CharacterProfile::getCreatedAt));
        List<CharacterView> views = new ArrayList<>(rows.size());
        for (CharacterProfile row : rows) {
            boolean official = row.getOwnerUserId() == null;
            if (!includeArchived && !official && STATUS_ARCHIVED.equals(row.getStatus())) {
                continue;
            }
            views.add(toView(row, activeId));
        }
        return views;
    }

    /**
     * 可见且未归档的角色，供会话补建使用。
     * 可见语义与 {@link #list(Long, boolean)} 一致：官方角色 + 本人自定义 + is_public 的存量角色。
     */
    @Transactional(readOnly = true)
    public List<CharacterProfile> activeVisibleCharacters(Long userId) {
        return characterMapper.selectList(Wrappers.<CharacterProfile>lambdaQuery()
                .and(wrapper -> wrapper.isNull(CharacterProfile::getOwnerUserId)
                        .or().eq(CharacterProfile::getPublicVisible, true)
                        .or().eq(CharacterProfile::getOwnerUserId, userId))
                .eq(CharacterProfile::getStatus, STATUS_ACTIVE)
                .orderByAsc(CharacterProfile::getCreatedAt));
    }

    @Transactional(readOnly = true)
    public CharacterView get(Long userId, Long characterId) {
        CharacterProfile character = requireVisible(userId, characterId);
        return toView(character, activeCharacterId(userId));
    }

    @Transactional
    public CharacterView create(Long userId, CreateCharacterRequest request) {
        CreateCharacterRequest input = request == null
                ? new CreateCharacterRequest(null, null, null, null, null, null, null)
                : request;
        String name = validator.normalizeName(input.displayName());
        ensureNameAvailable(userId, name, null);
        ensureUnderLimit(userId);

        int age = validator.normalizeAge(input.age());
        String intro = validator.normalizeIntro(input.intro());
        PersonalityView personality = validator.normalizePersonality(input.personality());
        FamilyView family = validator.normalizeFamily(input.family());
        String avatar = validator.normalizeAvatarConfig(input.avatarConfig());
        Long sourceCharacterId = null;
        if (input.sourceCharacterId() != null && !input.sourceCharacterId().isBlank()) {
            sourceCharacterId = requireVisible(userId, parseCharacterId(input.sourceCharacterId())).getId();
        }

        CharacterProfile character = new CharacterProfile();
        Long id = nextId(character);
        character.setId(id);
        character.setCode("custom-" + id);
        character.setDisplayName(name);
        character.setPersonaVersion("custom-v1");
        character.setPersonaConfig(CharacterPersona.toJson(objectMapper, age, intro, personality, family));
        character.setAvatarConfig(avatar);
        character.setOwnerUserId(userId);
        character.setSourceCharacterId(sourceCharacterId);
        character.setPublicVisible(false);
        character.setStatus(STATUS_ACTIVE);
        character.setVersion(0L);
        insertCharacter(character);
        /* 角色与会话同事务创建：每个 (userId, characterId) 只有一条会话。 */
        conversationProvisioner.ensure(userId, character);

        activityService.record(userId, "character.created", "USER", "core", null, null, null,
                payload(id, name));
        return toView(character, activeCharacterId(userId));
    }

    @Transactional
    public CharacterView update(Long userId, Long characterId, UpdateCharacterRequest request) {
        CharacterProfile character = requireVisible(userId, characterId);
        if (character.getOwnerUserId() == null) {
            throw ApiException.forbidden(CODE_READONLY, "官方角色人设只读，可复制为我的角色后再修改。");
        }
        if (!character.getOwnerUserId().equals(userId)) {
            throw ApiException.notFound(CODE_NOT_FOUND, "角色不存在");
        }
        if (request == null || request.version() == null) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "缺少版本号，请刷新后重试。");
        }

        JsonNode existingPersona = CharacterPersona.parse(objectMapper, character.getPersonaConfig());
        int age = request.age() == null
                ? CharacterPersona.age(existingPersona, 23)
                : validator.normalizeAge(request.age());
        String intro = request.intro() == null
                ? CharacterPersona.intro(existingPersona)
                : validator.normalizeIntro(request.intro());
        PersonalityView personality = request.personality() == null
                ? existingPersonality(existingPersona)
                : validator.normalizePersonality(request.personality());
        FamilyView family = request.family() == null
                ? existingFamily(existingPersona)
                : validator.normalizeFamily(request.family());
        String avatar = request.avatarConfig() == null
                ? normalizeStoredAvatar(character.getAvatarConfig())
                : validator.normalizeAvatarConfig(request.avatarConfig());

        if (request.displayName() != null) {
            String name = validator.normalizeName(request.displayName());
            if (!name.equals(character.getDisplayName())) {
                ensureNameAvailable(userId, name, characterId);
                character.setDisplayName(name);
            }
        }
        character.setPersonaConfig(CharacterPersona.toJson(objectMapper, age, intro, personality, family));
        character.setAvatarConfig(avatar);
        /* 乐观锁：只有与客户端版本一致才更新；影响行数为 0 即版本冲突。 */
        character.setVersion(request.version());
        int rows;
        try {
            rows = characterMapper.updateById(character);
        } catch (DuplicateKeyException ex) {
            throw ApiException.conflict(CODE_NAME_TAKEN, "这个名字已经被使用了，换一个吧。");
        }
        if (rows == 0) {
            throw ApiException.conflict(CODE_VERSION_CONFLICT, "这个角色在别处被修改过，请重新加载后再保存。");
        }

        activityService.record(userId, "character.updated", "USER", "core", null, null, null,
                payload(characterId, character.getDisplayName()));
        CharacterProfile saved = characterMapper.selectById(characterId);
        return toView(saved == null ? character : saved, activeCharacterId(userId));
    }

    @Transactional
    public CharacterView duplicate(Long userId, Long characterId, DuplicateCharacterRequest request) {
        CharacterProfile source = requireVisible(userId, characterId);
        ensureUnderLimit(userId);

        boolean official = source.getOwnerUserId() == null;
        JsonNode persona = CharacterPersona.parse(objectMapper, source.getPersonaConfig());
        int age = CharacterPersona.age(persona, 23);
        String intro = official ? background(persona) : CharacterPersona.intro(persona);
        PersonalityView personality = official
                ? CharacterCatalog.OFFICIAL_COPY_PERSONALITY
                : existingPersonality(persona);
        FamilyView family = official
                ? CharacterCatalog.OFFICIAL_COPY_FAMILY
                : existingFamily(persona);
        String avatar = request != null && request.avatarConfig() != null
                ? validator.normalizeAvatarConfig(request.avatarConfig())
                : normalizeStoredAvatar(source.getAvatarConfig());

        String requestedName = request == null ? null : request.displayName();
        String baseName = requestedName == null || requestedName.isBlank()
                ? copyBaseName(source.getDisplayName())
                : validator.normalizeName(requestedName);
        String name = uniqueCopyName(userId, baseName);

        CharacterProfile copy = new CharacterProfile();
        Long id = nextId(copy);
        copy.setId(id);
        copy.setCode("custom-" + id);
        copy.setDisplayName(name);
        copy.setPersonaVersion("custom-v1");
        copy.setPersonaConfig(CharacterPersona.toJson(objectMapper, age, intro, personality, family));
        copy.setAvatarConfig(avatar);
        copy.setOwnerUserId(userId);
        copy.setSourceCharacterId(source.getId());
        copy.setPublicVisible(false);
        copy.setStatus(STATUS_ACTIVE);
        copy.setVersion(0L);
        insertCharacter(copy);
        /* 复制角色同样在同一事务内补建唯一会话。 */
        conversationProvisioner.ensure(userId, copy);

        Map<String, Object> payload = payload(id, name);
        payload.put("sourceCharacterId", String.valueOf(source.getId()));
        activityService.record(userId, "character.created", "USER", "core", null, null, null, payload);
        return toView(copy, activeCharacterId(userId));
    }

    @Transactional
    public CharacterMutationResult archive(Long userId, Long characterId) {
        CharacterProfile character = requireOwnedCustom(userId, characterId);
        boolean wasActive = characterId.equals(activeCharacterId(userId));
        if (!STATUS_ARCHIVED.equals(character.getStatus())) {
            character.setStatus(STATUS_ARCHIVED);
            if (characterMapper.updateById(character) == 0) {
                throw ApiException.conflict(CODE_VERSION_CONFLICT,
                        "这个角色在别处被修改过，请刷新后再归档。");
            }
            activityService.record(userId, "character.archived", "USER", "core", null, null, null,
                    payload(characterId, character.getDisplayName()));
        }
        if (wasActive) {
            savePreference(userId, officialCharacter().getId());
        }
        Long activeId = activeCharacterId(userId);
        CharacterProfile saved = characterMapper.selectById(characterId);
        return new CharacterMutationResult(toView(saved == null ? character : saved, activeId),
                String.valueOf(activeId));
    }

    @Transactional
    public CharacterMutationResult restore(Long userId, Long characterId) {
        CharacterProfile character = requireOwnedCustom(userId, characterId);
        if (!STATUS_ACTIVE.equals(character.getStatus())) {
            character.setStatus(STATUS_ACTIVE);
            if (characterMapper.updateById(character) == 0) {
                throw ApiException.conflict(CODE_VERSION_CONFLICT,
                        "这个角色在别处被修改过，请刷新后再恢复。");
            }
            activityService.record(userId, "character.restored", "USER", "core", null, null, null,
                    payload(characterId, character.getDisplayName()));
        }
        /* 恢复后确保会话存在：归档期间会话仍保留，这里对已有会话是幂等操作。 */
        conversationProvisioner.ensure(userId, character);
        Long activeId = activeCharacterId(userId);
        CharacterProfile saved = characterMapper.selectById(characterId);
        return new CharacterMutationResult(toView(saved == null ? character : saved, activeId),
                String.valueOf(activeId));
    }

    /**
     * 彻底删除：角色硬删除（否则唯一键会阻塞同名重建），会话/消息/记忆/状态按角色物理清理，
     * 并在事务内把当前角色回退为官方。
     */
    @Transactional
    public CharacterPurgeResult purge(Long userId, Long characterId, String confirmName) {
        CharacterProfile character = requireOwnedCustom(userId, characterId);
        validator.requireConfirmName(character.getDisplayName(), confirmName);
        boolean wasActive = characterId.equals(activeCharacterId(userId));

        /* 先把当前角色回退到官方，再删数据：避免 user_preferences.active_character_id
           在硬删除瞬间仍引用被删角色（即便外键是 ON DELETE SET NULL 也不依赖隐式行为）。 */
        if (wasActive) {
            savePreference(userId, officialCharacter().getId());
        }

        int messages = messageMapper.hardDeleteByCharacter(userId, characterId);
        int memories = memoryMapper.hardDeleteByCharacterConversation(userId, characterId)
                + memoryMapper.hardDeleteByCharacterId(userId, characterId);
        int conversations = conversationMapper.hardDeleteByCharacter(userId, characterId);
        int states = stateMapper.hardDeleteByCharacter(userId, characterId);
        characterMapper.hardDeleteById(characterId);

        Long activeId = activeCharacterId(userId);
        activityService.record(userId, "character.purged", "USER", "core", null, null, null,
                Map.of("characterId", String.valueOf(characterId),
                        "displayName", character.getDisplayName(),
                        "conversations", conversations,
                        "messages", messages,
                        "memories", memories,
                        "states", states));
        return new CharacterPurgeResult(String.valueOf(activeId), conversations, messages, memories, states);
    }

    /** 切换当前角色：只接受官方或本人所有、且未归档的角色；同时确保该角色的唯一会话存在。 */
    @Transactional
    public ActiveCharacterResponse setActiveCharacter(Long userId, String requestedCharacterId) {
        Long characterId = parseCharacterId(requestedCharacterId);
        CharacterProfile character = requireVisible(userId, characterId);
        if (STATUS_ARCHIVED.equals(character.getStatus())) {
            throw ApiException.conflict(CODE_ARCHIVED, "这个角色已归档，请先恢复后再切换。");
        }
        savePreference(userId, characterId);
        Conversation conversation = conversationProvisioner.ensure(userId, character);
        activityService.record(userId, "character.activated", "USER", "core", null, null, null,
                payload(characterId, character.getDisplayName()));
        return new ActiveCharacterResponse(String.valueOf(characterId),
                String.valueOf(conversation.getId()));
    }

    /** 当前角色；偏好缺失、角色失效或归档时回退官方沈幼楚。 */
    @Transactional(readOnly = true)
    public Long activeCharacterId(Long userId) {
        UserPreference preference = preferenceMapper.selectById(userId);
        if (preference != null && preference.getActiveCharacterId() != null) {
            CharacterProfile character = characterMapper.selectById(preference.getActiveCharacterId());
            if (character != null && isVisible(character, userId)
                    && STATUS_ACTIVE.equals(character.getStatus())) {
                return character.getId();
            }
        }
        return officialCharacter().getId();
    }

    /**
     * 新建会话用的角色：不传则用当前角色；显式传入必须是官方或本人所有，且拒绝归档角色。
     */
    @Transactional(readOnly = true)
    public Long resolveConversationCharacter(Long userId, String requestedCharacterId) {
        if (requestedCharacterId == null || requestedCharacterId.isBlank()) {
            return activeCharacterId(userId);
        }
        Long characterId = parseCharacterId(requestedCharacterId);
        CharacterProfile character = requireVisible(userId, characterId);
        if (STATUS_ARCHIVED.equals(character.getStatus())) {
            throw ApiException.conflict(CODE_ARCHIVED, "这个角色已归档，请先恢复后再开始新的对话。");
        }
        return character.getId();
    }

    /** 状态/记忆等读接口的角色解析：不传用当前角色；官方或本人所有，否则 404。 */
    @Transactional(readOnly = true)
    public Long resolveVisibleCharacterId(Long userId, String requestedCharacterId) {
        if (requestedCharacterId == null || requestedCharacterId.isBlank()) {
            return activeCharacterId(userId);
        }
        return requireVisible(userId, parseCharacterId(requestedCharacterId)).getId();
    }

    /** 角色 ID 对外是字符串；非数字输入视为参数错误，不落到数据库查询。 */
    public Long parseCharacterId(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "角色 ID 不能为空。");
        }
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException ex) {
            throw ApiException.validation("角色 ID 格式不正确");
        }
    }

    /** 官方或本人所有；否则 404，避免泄露他人角色的存在性。 */
    @Transactional(readOnly = true)
    public CharacterProfile requireVisible(Long userId, Long characterId) {
        CharacterProfile character = characterId == null ? null : characterMapper.selectById(characterId);
        if (character == null || !isVisible(character, userId)) {
            throw ApiException.notFound(CODE_NOT_FOUND, "角色不存在");
        }
        return character;
    }

    public boolean isVisible(CharacterProfile character, Long userId) {
        if (character.getOwnerUserId() == null || Boolean.TRUE.equals(character.getPublicVisible())) {
            return true;
        }
        return character.getOwnerUserId().equals(userId);
    }

    private CharacterProfile requireOwnedCustom(Long userId, Long characterId) {
        CharacterProfile character = requireVisible(userId, characterId);
        if (character.getOwnerUserId() == null) {
            throw ApiException.forbidden(CODE_READONLY, "官方角色不可修改。");
        }
        if (!character.getOwnerUserId().equals(userId)) {
            throw ApiException.notFound(CODE_NOT_FOUND, "角色不存在");
        }
        return character;
    }

    private CharacterProfile officialCharacter() {
        CharacterProfile character = characterMapper.selectOne(Wrappers.<CharacterProfile>lambdaQuery()
                .eq(CharacterProfile::getCode, DEFAULT_CHARACTER_CODE));
        if (character == null) {
            throw ApiException.notFound("默认角色未初始化，请先执行数据库迁移");
        }
        return character;
    }

    private void ensureUnderLimit(Long userId) {
        if (countCustom(userId) >= CharacterCatalog.MAX_CUSTOM_CHARACTERS) {
            throw ApiException.conflict(CODE_LIMIT_REACHED, "最多保存 12 个自定义角色，请先归档或删除一个。");
        }
    }

    private long countCustom(Long userId) {
        Long count = characterMapper.selectCount(Wrappers.<CharacterProfile>lambdaQuery()
                .eq(CharacterProfile::getOwnerUserId, userId));
        return count == null ? 0L : count;
    }

    private void ensureNameAvailable(Long userId, String name, Long excludeId) {
        if (!isNameAvailable(userId, name, excludeId)) {
            throw ApiException.conflict(CODE_NAME_TAKEN, "这个名字已经被使用了，换一个吧。");
        }
    }

    private boolean isNameAvailable(Long userId, String name, Long excludeId) {
        Long count = characterMapper.selectCount(Wrappers.<CharacterProfile>lambdaQuery()
                .eq(CharacterProfile::getDisplayName, name)
                .and(wrapper -> wrapper.isNull(CharacterProfile::getOwnerUserId)
                        .or().eq(CharacterProfile::getOwnerUserId, userId))
                .ne(excludeId != null, CharacterProfile::getId, excludeId));
        return count == null || count == 0L;
    }

    private void insertCharacter(CharacterProfile character) {
        try {
            characterMapper.insert(character);
        } catch (DuplicateKeyException ex) {
            throw ApiException.conflict(CODE_NAME_TAKEN, "这个名字已经被使用了，换一个吧。");
        }
    }

    private void savePreference(Long userId, Long characterId) {
        UserPreference preference = preferenceMapper.selectById(userId);
        if (preference == null) {
            try {
                preferenceMapper.insert(new UserPreference(userId, characterId));
                return;
            } catch (DuplicateKeyException ex) {
                preference = preferenceMapper.selectById(userId);
            }
        }
        if (preference != null) {
            preference.setActiveCharacterId(characterId);
            preferenceMapper.updateById(preference);
        }
    }

    private CharacterView toView(CharacterProfile character, Long activeCharacterId) {
        boolean official = character.getOwnerUserId() == null;
        JsonNode persona = CharacterPersona.parse(objectMapper, character.getPersonaConfig());
        int age = CharacterPersona.age(persona, 23);
        String intro;
        List<String> tags = new ArrayList<>();
        PersonalityView personality = null;
        FamilyView family = null;
        if (official) {
            intro = background(persona);
            JsonNode traits = persona == null ? null : persona.get("traits");
            if (traits != null && traits.isArray()) {
                for (JsonNode trait : traits) {
                    if (trait.isTextual()) {
                        tags.add(trait.asText());
                    }
                }
            }
        } else {
            intro = CharacterPersona.intro(persona);
            personality = existingPersonality(persona);
            family = existingFamily(persona);
            tags = new ArrayList<>(CharacterCatalog.customTags(personality, family));
        }
        String status = character.getStatus() == null ? STATUS_ACTIVE : character.getStatus();
        return new CharacterView(
                String.valueOf(character.getId()),
                character.getCode(),
                character.getDisplayName(),
                official,
                activeCharacterId != null && activeCharacterId.equals(character.getId()),
                status,
                age,
                intro,
                List.copyOf(tags),
                parseAvatar(character.getAvatarConfig()),
                personality,
                family,
                character.getVersion() == null ? 0L : character.getVersion(),
                character.getCreatedAt(),
                character.getUpdatedAt());
    }

    private PersonalityView existingPersonality(JsonNode persona) {
        PersonalityView personality = CharacterPersona.personality(persona);
        return personality == null ? CharacterCatalog.DEFAULT_PERSONALITY : personality;
    }

    private FamilyView existingFamily(JsonNode persona) {
        FamilyView family = CharacterPersona.family(persona);
        return family == null ? CharacterCatalog.DEFAULT_FAMILY : family;
    }

    private String background(JsonNode persona) {
        if (persona == null || !persona.isObject()) {
            return "";
        }
        JsonNode background = persona.get("background");
        return background != null && background.isTextual() ? background.asText() : "";
    }

    private JsonNode parseAvatar(String json) {
        if (json != null && !json.isBlank()) {
            try {
                JsonNode node = objectMapper.readTree(json);
                if (node != null && node.isObject()) {
                    return node;
                }
            } catch (Exception ignored) {
                /* 脏数据回退默认形象，避免角色卡整体不可用 */
            }
        }
        try {
            return objectMapper.readTree(CharacterCatalog.DEFAULT_AVATAR_JSON);
        } catch (Exception ex) {
            throw new IllegalStateException("默认形象配置不可解析", ex);
        }
    }

    private String normalizeStoredAvatar(String stored) {
        return validator.normalizeAvatarConfig(parseAvatar(stored));
    }

    private Long nextId(CharacterProfile character) {
        return identifierGenerator.nextId(character).longValue();
    }

    private String copyBaseName(String sourceName) {
        String name = sourceName == null || sourceName.isBlank() ? "她" : sourceName.trim();
        return truncate(name, CharacterCatalog.MAX_NAME - 3) + "的副本";
    }

    private String uniqueCopyName(Long userId, String baseName) {
        if (isNameAvailable(userId, baseName, null)) {
            return baseName;
        }
        for (int index = 2; index < 100; index++) {
            String suffix = " " + index;
            String candidate = truncate(baseName, CharacterCatalog.MAX_NAME - suffix.length()) + suffix;
            if (isNameAvailable(userId, candidate, null)) {
                return candidate;
            }
        }
        throw ApiException.conflict(CODE_NAME_TAKEN, "这个名字已经被使用了，换一个吧。");
    }

    private String truncate(String value, int maxLength) {
        if (value == null) {
            return "";
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private Map<String, Object> payload(Long characterId, String displayName) {
        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("characterId", String.valueOf(characterId));
        payload.put("displayName", displayName);
        return payload;
    }
}
