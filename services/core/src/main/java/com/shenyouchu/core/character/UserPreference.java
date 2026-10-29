package com.shenyouchu.core.character;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.Instant;

/**
 * 用户偏好（当前角色）。
 *
 * <p>注意：这张表没有 deleted_at，因此不能继承 {@link com.shenyouchu.core.common.BaseEntity}，
 * 否则 MyBatis-Plus 全局逻辑删除会给查询追加不存在的 deleted_at 条件。
 */
@TableName("user_preferences")
public class UserPreference {

    @TableId(value = "user_id", type = IdType.INPUT)
    private Long userId;

    private Long activeCharacterId;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(value = "updated_at", fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;

    protected UserPreference() {
    }

    public UserPreference(Long userId, Long activeCharacterId) {
        this.userId = userId;
        this.activeCharacterId = activeCharacterId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getActiveCharacterId() {
        return activeCharacterId;
    }

    public void setActiveCharacterId(Long activeCharacterId) {
        this.activeCharacterId = activeCharacterId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
