package com.shenyouchu.core.character;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.shenyouchu.core.common.BaseEntity;

/**
 * 角色模板（官方 + 用户自定义）。类名避免与 java.lang.Character 冲突。
 *
 * <p>owner_user_id 为 NULL 表示官方角色（人设只读）；非 NULL 表示该用户的自定义角色。
 * <p>avatar_config 保存形象参数 JSON；persona_config 官方沿用 v1 结构，自定义保存 v2 结构。
 */
@TableName("characters")
public class CharacterProfile extends BaseEntity {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long ownerUserId;

    private Long sourceCharacterId;

    private String code;

    private String displayName;

    private String personaVersion;

    private String personaConfig;

    /** 形象参数 JSON 原文；官方为空时服务端返回默认对象。 */
    private String avatarConfig;

    @TableField("is_public")
    private Boolean publicVisible;

    /** active / archived；归档只作用于自定义角色。 */
    private String status = "active";

    /** 乐观锁：PATCH 必须匹配客户端版本号。 */
    @Version
    private Long version = 0L;

    public CharacterProfile() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(Long ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public Long getSourceCharacterId() {
        return sourceCharacterId;
    }

    public void setSourceCharacterId(Long sourceCharacterId) {
        this.sourceCharacterId = sourceCharacterId;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getPersonaVersion() {
        return personaVersion;
    }

    public void setPersonaVersion(String personaVersion) {
        this.personaVersion = personaVersion;
    }

    public String getPersonaConfig() {
        return personaConfig;
    }

    public void setPersonaConfig(String personaConfig) {
        this.personaConfig = personaConfig;
    }

    public String getAvatarConfig() {
        return avatarConfig;
    }

    public void setAvatarConfig(String avatarConfig) {
        this.avatarConfig = avatarConfig;
    }

    public Boolean getPublicVisible() {
        return publicVisible;
    }

    public void setPublicVisible(Boolean publicVisible) {
        this.publicVisible = publicVisible;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }
}
