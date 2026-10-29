package com.shenyouchu.core.relationship.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shenyouchu.core.relationship.UserCharacterState;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserCharacterStateMapper extends BaseMapper<UserCharacterState> {

    /** 彻底删除角色时物理清理关系状态（外键引用 characters）。 */
    @Delete("DELETE FROM user_character_states WHERE user_id = #{userId} AND character_id = #{characterId}")
    int hardDeleteByCharacter(@Param("userId") Long userId, @Param("characterId") Long characterId);
}
