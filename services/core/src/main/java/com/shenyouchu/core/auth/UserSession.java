package com.shenyouchu.core.auth;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shenyouchu.core.common.BaseEntity;

import java.time.Instant;

/** 不透明会话凭证：只保存 token 的 SHA-256 哈希，原始 token 仅在签发时返回一次。 */
@TableName("user_sessions")
public class UserSession extends BaseEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String userId;

    private String tokenHash;

    private Instant expiresAt;

    protected UserSession() {
    }

    public UserSession(String id, String userId, String tokenHash, Instant expiresAt) {
        this.id = id;
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public void setTokenHash(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public boolean isExpiredAt(Instant now) {
        return !expiresAt.isAfter(now);
    }
}
