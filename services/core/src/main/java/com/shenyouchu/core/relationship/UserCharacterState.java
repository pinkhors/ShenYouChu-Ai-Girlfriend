package com.shenyouchu.core.relationship;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.shenyouchu.core.common.BaseEntity;

/** 用户与角色的关系状态：心情、亲密度有界，单次事件只生效一次。 */
@TableName("user_character_states")
public class UserCharacterState extends BaseEntity {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long userId;

    private Long characterId;

    private Integer mood = 50;

    private Integer intimacy = 0;

    @Version
    private Long stateVersion = 0L;

    protected UserCharacterState() {
    }

    public UserCharacterState(Long userId, Long characterId) {
        this.userId = userId;
        this.characterId = characterId;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public Long getCharacterId() {
        return characterId;
    }

    public Integer getMood() {
        return mood;
    }

    public void setMood(Integer mood) {
        this.mood = mood;
    }

    public Integer getIntimacy() {
        return intimacy;
    }

    public void setIntimacy(Integer intimacy) {
        this.intimacy = intimacy;
    }

    public Long getStateVersion() {
        return stateVersion;
    }

    public void setStateVersion(Long stateVersion) {
        this.stateVersion = stateVersion;
    }
}
