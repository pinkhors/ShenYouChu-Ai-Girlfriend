package com.shenyouchu.core.message.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shenyouchu.core.message.Message;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MessageMapper extends BaseMapper<Message> {

    /** 彻底删除角色时，先按会话物理清理消息，避免外键阻塞后续硬删除。 */
    @Delete("DELETE m FROM messages m JOIN conversations c ON m.conversation_id = c.id "
            + "WHERE c.user_id = #{userId} AND c.character_id = #{characterId}")
    int hardDeleteByCharacter(@Param("userId") Long userId, @Param("characterId") Long characterId);
}
