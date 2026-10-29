package com.shenyouchu.core.character.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shenyouchu.core.character.CharacterProfile;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CharacterMapper extends BaseMapper<CharacterProfile> {

    /**
     * 彻底删除角色（purge）。
     * 必须物理删除：逻辑删除会让唯一键 uk_characters_owner_name 继续占用名字，
     * 导致同名角色无法重新创建。
     */
    @Delete("DELETE FROM characters WHERE id = #{id}")
    int hardDeleteById(@Param("id") Long id);
}
