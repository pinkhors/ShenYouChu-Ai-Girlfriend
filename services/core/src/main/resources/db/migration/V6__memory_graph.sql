-- 记忆星图：原文分块、向量引用、语义边、召回事件、只读快照。
-- 设计见 docs/08-memory-graph.md；快照不存向量，向量只存 memory_chunks。

CREATE TABLE memory_chunks (
    id                   BIGINT        NOT NULL,
    user_id              BIGINT        NOT NULL,
    character_id         BIGINT        NOT NULL,
    conversation_id      BIGINT        NOT NULL,
    turn_id              VARCHAR(36)   NULL,
    user_message_id      BIGINT        NULL,
    assistant_message_id BIGINT        NULL,
    chunk_text           TEXT          NOT NULL,
    summary              VARCHAR(200)  NULL,
    category             VARCHAR(32)   NOT NULL DEFAULT 'episode',
    topics_json          VARCHAR(500)  NULL,
    entities_json        VARCHAR(500)  NULL,
    embedding_model      VARCHAR(64)   NULL,
    embedding_dim        INT           NULL,
    embedding_json       MEDIUMTEXT    NULL,
    importance           DECIMAL(4, 3) NOT NULL DEFAULT 0.500,
    valid_from           DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    invalid_at           DATETIME(3)   NULL,
    superseded_by        BIGINT        NULL,
    created_at           DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at           DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at           DATETIME(3)   NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_memory_chunks_turn (user_id, turn_id),
    KEY idx_memory_chunks_owner (user_id, character_id, invalid_at),
    KEY idx_memory_chunks_conversation (conversation_id, created_at),
    CONSTRAINT fk_memory_chunks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_memory_chunks_character FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE memory_edges (
    id              BIGINT       NOT NULL,
    user_id         BIGINT       NOT NULL,
    character_id    BIGINT       NOT NULL,
    source_chunk_id BIGINT       NOT NULL,
    target_chunk_id BIGINT       NOT NULL,
    edge_type       VARCHAR(16)  NOT NULL,
    weight          DECIMAL(6, 4) NOT NULL DEFAULT 0.5000,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at      DATETIME(3)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_memory_edges_pair (user_id, source_chunk_id, target_chunk_id, edge_type),
    KEY idx_memory_edges_owner (user_id, character_id),
    CONSTRAINT fk_memory_edges_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_memory_edges_character FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE,
    CONSTRAINT fk_memory_edges_source FOREIGN KEY (source_chunk_id) REFERENCES memory_chunks (id) ON DELETE CASCADE,
    CONSTRAINT fk_memory_edges_target FOREIGN KEY (target_chunk_id) REFERENCES memory_chunks (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE memory_recall_events (
    id           BIGINT      NOT NULL,
    user_id      BIGINT      NOT NULL,
    character_id BIGINT      NOT NULL,
    chunk_id     BIGINT      NOT NULL,
    turn_id      VARCHAR(36) NULL,
    rank_no      INT         NULL,
    injected     TINYINT(1)  NOT NULL DEFAULT 0,
    created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at   DATETIME(3) NULL,
    PRIMARY KEY (id),
    KEY idx_memory_recall_owner (user_id, character_id, created_at),
    KEY idx_memory_recall_chunk (chunk_id, created_at),
    CONSTRAINT fk_memory_recall_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_memory_recall_character FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE,
    CONSTRAINT fk_memory_recall_chunk FOREIGN KEY (chunk_id) REFERENCES memory_chunks (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE memory_graph_snapshots (
    id           BIGINT       NOT NULL,
    user_id      BIGINT       NOT NULL,
    character_id BIGINT       NOT NULL,
    version      INT          NOT NULL DEFAULT 1,
    mode         VARCHAR(16)  NOT NULL DEFAULT 'incremental',
    payload_json MEDIUMTEXT   NOT NULL,
    generated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at   DATETIME(3)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_memory_graph_owner (user_id, character_id),
    CONSTRAINT fk_memory_graph_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_memory_graph_character FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
