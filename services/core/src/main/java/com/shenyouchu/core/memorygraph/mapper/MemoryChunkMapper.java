package com.shenyouchu.core.memorygraph.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shenyouchu.core.memorygraph.MemoryChunk;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface MemoryChunkMapper extends BaseMapper<MemoryChunk> {

    /** 夜间校准：所有存在 chunk 的 (user_id, character_id)。 */
    @Select("SELECT DISTINCT user_id, character_id FROM memory_chunks WHERE deleted_at IS NULL")
    List<MemoryChunk> selectOwners();
}
