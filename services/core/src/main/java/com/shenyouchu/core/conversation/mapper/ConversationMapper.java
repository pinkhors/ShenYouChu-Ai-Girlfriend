package com.shenyouchu.core.conversation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shenyouchu.core.conversation.Conversation;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ConversationMapper extends BaseMapper<Conversation> {

    /**
     * 彻底删除角色时物理清理会话：characters 被 conversations.character_id 外键引用，
     * 只做逻辑删除会让硬删除角色失败；purge 语义本身就是不可恢复。
     */
    @Delete("DELETE FROM conversations WHERE user_id = #{userId} AND character_id = #{characterId}")
    int hardDeleteByCharacter(@Param("userId") Long userId, @Param("characterId") Long characterId);
}
