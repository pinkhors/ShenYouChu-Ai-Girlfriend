-- 用户自带语音厂商凭据（BYOK）。
-- payload 为 AES-256-GCM 加密后的 JSON；接口永远不回显明文。
CREATE TABLE user_voice_credentials (
    id                BIGINT       NOT NULL,
    user_id           BIGINT       NOT NULL,
    provider_id       VARCHAR(64)  NOT NULL,
    encrypted_payload TEXT         NOT NULL,
    status            VARCHAR(20)  NOT NULL,
    last_verified_at  DATETIME(3)  NULL,
    created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_provider (user_id, provider_id),
    CONSTRAINT fk_user_voice_credentials_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
