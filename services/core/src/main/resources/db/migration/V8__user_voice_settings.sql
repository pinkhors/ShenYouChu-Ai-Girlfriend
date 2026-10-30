-- 用户级「通话默认声音」：一个用户一条，指向某个 provider 及其说话参数。
-- 与 user_voice_credentials 分离：凭据是密钥，设置是可展示/可切换的偏好。
CREATE TABLE user_voice_settings (
    user_id     BIGINT      NOT NULL,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    provider_id VARCHAR(64) NOT NULL,
    params_json TEXT        NOT NULL,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_voice_settings_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
