-- M0 baseline schema
-- 约定：主键 UUID 字符串；时间 UTC DATETIME(3)；业务表均含 created_at/updated_at/deleted_at。
-- 归属：所有用户私有表含 user_id，查询必须带归属条件。

CREATE TABLE users (
    id              VARCHAR(36)  NOT NULL,
    username        VARCHAR(64)  NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    role            VARCHAR(20)  NOT NULL DEFAULT 'user',
    role_granted_at DATETIME(3)  NULL,
    last_login_at   DATETIME(3)  NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at      DATETIME(3)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username),
    KEY idx_users_status (status),
    KEY idx_users_role (role)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE user_sessions (
    id         VARCHAR(36) NOT NULL,
    user_id    VARCHAR(36) NOT NULL,
    token_hash CHAR(64)    NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_sessions_token_hash (token_hash),
    KEY idx_user_sessions_user (user_id, expires_at),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE characters (
    id              VARCHAR(36) NOT NULL,
    code            VARCHAR(64) NOT NULL,
    display_name    VARCHAR(64) NOT NULL,
    persona_version VARCHAR(20) NOT NULL,
    persona_config  JSON        NULL,
    is_public       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at      DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_characters_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE user_character_states (
    id            VARCHAR(36) NOT NULL,
    user_id       VARCHAR(36) NOT NULL,
    character_id  VARCHAR(36) NOT NULL,
    mood          INT         NOT NULL DEFAULT 50,
    intimacy      INT         NOT NULL DEFAULT 0,
    state_version BIGINT      NOT NULL DEFAULT 0,
    created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at    DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_character_states (user_id, character_id),
    CONSTRAINT fk_ucs_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_ucs_character FOREIGN KEY (character_id) REFERENCES characters (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE conversations (
    id              VARCHAR(36)  NOT NULL,
    user_id         VARCHAR(36)  NOT NULL,
    character_id    VARCHAR(36)  NOT NULL,
    title           VARCHAR(200) NULL,
    last_message_at DATETIME(3)  NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at      DATETIME(3)  NULL,
    PRIMARY KEY (id),
    KEY idx_conversations_user_last_message (user_id, last_message_at),
    CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_conversations_character FOREIGN KEY (character_id) REFERENCES characters (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE messages (
    id             VARCHAR(36)   NOT NULL,
    conversation_id VARCHAR(36)  NOT NULL,
    user_id        VARCHAR(36)   NOT NULL,
    turn_id        VARCHAR(36)   NULL,
    role           VARCHAR(16)   NOT NULL,
    content        MEDIUMTEXT    NOT NULL,
    content_format VARCHAR(16)   NOT NULL DEFAULT 'text',
    source         VARCHAR(16)   NOT NULL DEFAULT 'text',
    asr_confidence DECIMAL(4, 3) NULL,
    token_count    INT           NULL,
    created_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at     DATETIME(3)   NULL,
    PRIMARY KEY (id),
    KEY idx_messages_conversation_created (conversation_id, created_at),
    KEY idx_messages_user_created (user_id, created_at),
    KEY idx_messages_turn (turn_id),
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id),
    CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE memories (
    id                VARCHAR(36) NOT NULL,
    user_id           VARCHAR(36) NOT NULL,
    conversation_id   VARCHAR(36) NULL,
    source_message_id VARCHAR(36) NULL,
    memory_type       VARCHAR(32) NOT NULL DEFAULT 'other',
    content           TEXT        NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'active',
    embedding_model   VARCHAR(64) NULL,
    embedding_dim     INT         NULL,
    created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at        DATETIME(3) NULL,
    PRIMARY KEY (id),
    KEY idx_memories_user_type_created (user_id, memory_type, created_at),
    CONSTRAINT fk_memories_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE activity_events (
    id              VARCHAR(36) NOT NULL,
    user_id         VARCHAR(36) NOT NULL,
    conversation_id VARCHAR(36) NULL,
    turn_id         VARCHAR(36) NULL,
    event_type      VARCHAR(64) NOT NULL,
    actor           VARCHAR(16) NOT NULL,
    source          VARCHAR(32) NOT NULL,
    occurred_at     DATETIME(3) NOT NULL,
    trace_id        VARCHAR(64) NULL,
    schema_version  INT         NOT NULL DEFAULT 1,
    payload         JSON        NULL,
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at      DATETIME(3) NULL,
    PRIMARY KEY (id),
    KEY idx_activity_user_occurred (user_id, occurred_at),
    KEY idx_activity_user_type_occurred (user_id, event_type, occurred_at),
    KEY idx_activity_trace (trace_id),
    CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
