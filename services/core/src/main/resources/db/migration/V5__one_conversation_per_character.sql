-- 每个 (user_id, character_id) 只保留一条会话（用户-角色一对一会话）。
--
-- 去重策略（MySQL 8）：
--   1) 有未删除会话的组：优先保留 last_message_at / created_at 最新、id 最大的 active 会话；
--   2) 其余会话的 messages / memories / activity_events 统一迁到保留会话，再物理删除这些会话；
--   3) 只有 deleted 记录的组：物理删除 messages / memories，activity_events.conversation_id 置 NULL，
--      再物理删除这些会话；
--   4) 清理完成后建立唯一键 uk_conversations_user_character，由数据库兜底并发创建。
--
-- 注：迁移会原样保留 messages.deleted_at / memories.deleted_at，已逻辑删除的数据不会重新可见。

DROP TEMPORARY TABLE IF EXISTS tmp_conversation_keep;
CREATE TEMPORARY TABLE tmp_conversation_keep (
    keep_id      BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    character_id BIGINT NOT NULL,
    PRIMARY KEY (keep_id),
    KEY idx_tmp_conversation_keep_group (user_id, character_id)
) ENGINE = InnoDB;

-- 每组选出一条 active 会话作为保留会话。
INSERT INTO tmp_conversation_keep (keep_id, user_id, character_id)
SELECT ranked.id, ranked.user_id, ranked.character_id
FROM (
    SELECT c.id,
           c.user_id,
           c.character_id,
           ROW_NUMBER() OVER (
               PARTITION BY c.user_id, c.character_id
               ORDER BY c.last_message_at DESC, c.created_at DESC, c.id DESC
           ) AS row_num
    FROM conversations c
    WHERE c.deleted_at IS NULL
) ranked
WHERE ranked.row_num = 1;

-- 非保留会话的消息、记忆、活动事件全部指向保留会话。
-- 逻辑删除标记不修改：已删除的消息/记忆仍不可见，但不会再因会话物理删除而丢失关联。
UPDATE messages m
JOIN conversations c ON c.id = m.conversation_id
JOIN tmp_conversation_keep k ON k.user_id = c.user_id AND k.character_id = c.character_id
SET m.conversation_id = k.keep_id
WHERE c.id <> k.keep_id;

UPDATE memories m
JOIN conversations c ON c.id = m.conversation_id
JOIN tmp_conversation_keep k ON k.user_id = c.user_id AND k.character_id = c.character_id
SET m.conversation_id = k.keep_id
WHERE c.id <> k.keep_id;

UPDATE activity_events a
JOIN conversations c ON c.id = a.conversation_id
JOIN tmp_conversation_keep k ON k.user_id = c.user_id AND k.character_id = c.character_id
SET a.conversation_id = k.keep_id
WHERE c.id <> k.keep_id;

-- 保留会话的 last_message_at 更新为组内最大值。
UPDATE conversations c
JOIN tmp_conversation_keep k ON k.keep_id = c.id
JOIN (
    SELECT user_id, character_id, MAX(last_message_at) AS max_last_message_at
    FROM conversations
    GROUP BY user_id, character_id
) grouped ON grouped.user_id = c.user_id AND grouped.character_id = c.character_id
SET c.last_message_at = COALESCE(grouped.max_last_message_at, c.last_message_at);

-- 有保留会话的组：物理删除其余会话（含该组内的 deleted 记录）。
DELETE c
FROM conversations c
JOIN tmp_conversation_keep k ON k.user_id = c.user_id AND k.character_id = c.character_id
WHERE c.id <> k.keep_id;

-- 只有 deleted 记录的组：先清理关联数据，再物理删除会话。
DROP TEMPORARY TABLE IF EXISTS tmp_conversation_only_deleted;
CREATE TEMPORARY TABLE tmp_conversation_only_deleted (
    id BIGINT NOT NULL,
    PRIMARY KEY (id)
) ENGINE = InnoDB;

INSERT INTO tmp_conversation_only_deleted (id)
SELECT c.id
FROM conversations c
LEFT JOIN tmp_conversation_keep k
       ON k.user_id = c.user_id AND k.character_id = c.character_id
WHERE k.keep_id IS NULL;

DELETE m
FROM messages m
JOIN tmp_conversation_only_deleted d ON m.conversation_id = d.id;

DELETE m
FROM memories m
JOIN tmp_conversation_only_deleted d ON m.conversation_id = d.id;

UPDATE activity_events a
JOIN tmp_conversation_only_deleted d ON a.conversation_id = d.id
SET a.conversation_id = NULL;

DELETE c
FROM conversations c
JOIN tmp_conversation_only_deleted d ON c.id = d.id;

DROP TEMPORARY TABLE IF EXISTS tmp_conversation_only_deleted;
DROP TEMPORARY TABLE IF EXISTS tmp_conversation_keep;

ALTER TABLE conversations
    ADD UNIQUE KEY uk_conversations_user_character (user_id, character_id);
