-- 每个用户自己的 LLM 配置；未配置时回退到服务端环境变量默认值。
-- api_key 以明文保存（仅服务端可读，接口不回显）；后续可迁移到加密存储。
CREATE TABLE user_llm_settings (
    user_id         BIGINT       NOT NULL,
    enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
    base_url        VARCHAR(500) NULL,
    model           VARCHAR(200) NULL,
    api_key         VARCHAR(512) NULL,
    max_tokens      INT          NOT NULL DEFAULT 512,
    temperature     DECIMAL(3, 2) NOT NULL DEFAULT 0.80,
    timeout_seconds INT          NOT NULL DEFAULT 60,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_llm_settings_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
