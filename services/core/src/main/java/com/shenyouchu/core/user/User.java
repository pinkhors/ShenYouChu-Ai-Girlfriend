package com.shenyouchu.core.user;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shenyouchu.core.common.BaseEntity;

import java.time.Instant;

@TableName("users")
public class User extends BaseEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String username;

    private String passwordHash;

    private String status = "active";

    private String role = "user";

    private Instant roleGrantedAt;

    private Instant lastLoginAt;

    protected User() {
    }

    public User(String id, String username, String passwordHash) {
        this.id = id;
        this.username = username;
        this.passwordHash = passwordHash;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
        this.roleGrantedAt = Instant.now();
    }

    public Instant getRoleGrantedAt() {
        return roleGrantedAt;
    }

    public void setRoleGrantedAt(Instant roleGrantedAt) {
        this.roleGrantedAt = roleGrantedAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public void markLoggedIn() {
        this.lastLoginAt = Instant.now();
    }
}
