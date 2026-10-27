package com.shenyouchu.core.character;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shenyouchu.core.common.BaseEntity;

/** 角色模板（全局只读）。类名避免与 java.lang.Character 冲突。 */
@TableName("characters")
public class CharacterProfile extends BaseEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String code;

    private String displayName;

    private String personaVersion;

    private String personaConfig;

    @TableField("is_public")
    private Boolean publicVisible;

    protected CharacterProfile() {
    }

    public String getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getPersonaVersion() {
        return personaVersion;
    }

    public String getPersonaConfig() {
        return personaConfig;
    }

    public Boolean getPublicVisible() {
        return publicVisible;
    }
}
