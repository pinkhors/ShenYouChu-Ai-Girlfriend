-- 角色自定义（Character Studio，见 docs/07-character-customization.md §5.1 / §5.6）
-- 复用 characters 表承载“官方 + 用户自定义”角色：
--   owner_user_id IS NULL  → 官方角色（人设只读）
--   owner_user_id = 用户   → 该用户的自定义角色（最多 12 个，含归档）
-- code 官方固定；自定义为 custom-<雪花ID>。persona_version 自定义写 custom-v1。

ALTER TABLE characters
    ADD COLUMN owner_user_id BIGINT NULL AFTER id;

ALTER TABLE characters
    ADD COLUMN source_character_id BIGINT NULL AFTER owner_user_id;

ALTER TABLE characters
    ADD COLUMN avatar_config JSON NULL AFTER persona_config;

ALTER TABLE characters
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER is_public;

ALTER TABLE characters
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0 AFTER status;

ALTER TABLE characters
    ADD INDEX idx_characters_owner_status (owner_user_id, status),
    ADD INDEX idx_characters_source (source_character_id),
    -- 官方角色 owner 为 NULL，MySQL 唯一键允许多个 NULL，不影响官方；自定义角色同用户内名字唯一（排序规则天然大小写不敏感）
    ADD UNIQUE KEY uk_characters_owner_name (owner_user_id, display_name);

-- 外键单独添加：确保上面的 (owner_user_id, status) 索引已存在。
ALTER TABLE characters
    ADD CONSTRAINT fk_characters_owner FOREIGN KEY (owner_user_id) REFERENCES users (id);

-- 官方沈幼楚补默认形象（与前端 AvatarConfig/DEFAULT_AVATAR 及文档 §3.2 完全一致）；
-- 本机覆盖仍由客户端保存，服务端值仅作为官方默认值返回。
UPDATE characters
SET avatar_config = JSON_OBJECT(
        'skinTone', 'natural',
        'hairStyle', 'long-straight',
        'hairColor', 'black',
        'faceShape', 0.6,
        'eyeColor', 'dark',
        'eyeSize', 0.55,
        'eyeSpacing', 0.5,
        'browStyle', 'soft',
        'lipColor', 'rose',
        'lipFullness', 0.5,
        'blush', 0.35,
        'outfitStyle', 'casual',
        'outfitColor', 'cream',
        'accessory', 'none'
    )
WHERE code = 'shenyouchu'
  AND avatar_config IS NULL;

-- 当前角色：每个用户一条；不建逻辑删除字段（偏好本身可覆盖）。
CREATE TABLE user_preferences (
    user_id             BIGINT      NOT NULL,
    active_character_id BIGINT      NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_user_preferences_character FOREIGN KEY (active_character_id)
        REFERENCES characters (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- 会话按“用户 + 角色 + 最后消息时间”排序/过滤。
ALTER TABLE conversations
    ADD INDEX idx_conversations_user_character_last (user_id, character_id, last_message_at);

-- 记忆挂到角色上：新建记忆由会话带入角色；历史数据按 conversation 回填。
ALTER TABLE memories
    ADD COLUMN character_id BIGINT NULL AFTER user_id,
    ADD INDEX idx_memories_user_character_created (user_id, character_id, created_at);

UPDATE memories m
    JOIN conversations c ON m.conversation_id = c.id
SET m.character_id = c.character_id
WHERE m.character_id IS NULL;

-- 已存在用户的当前角色回退为官方沈幼楚；INSERT IGNORE 保证迁移可重复执行（幂等）。
INSERT IGNORE INTO user_preferences (user_id, active_character_id)
SELECT u.id, c.id
FROM users u
JOIN characters c ON c.code = 'shenyouchu'
WHERE u.deleted_at IS NULL;
