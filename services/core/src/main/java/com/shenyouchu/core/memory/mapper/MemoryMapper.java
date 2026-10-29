package com.shenyouchu.core.memory.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shenyouchu.core.memory.Memory;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MemoryMapper extends BaseMapper<Memory> {

    /** 按角色归属的会话物理清理记忆（purge 用）。 */
    @Delete("DELETE m FROM memories m JOIN conversations c ON m.conversation_id = c.id "
            + "WHERE c.user_id = #{userId} AND c.character_id = #{characterId}")
    int hardDeleteByCharacterConversation(@Param("userId") Long userId, @Param("characterId") Long characterId);

    /** 没有会话归属（conversation_id 为空）但直接挂在角色上的记忆。 */
    @Delete("DELETE FROM memories WHERE user_id = #{userId} AND character_id = #{characterId}")
    int hardDeleteByCharacterId(@Param("userId") Long userId, @Param("characterId") Long characterId);
}
