package com.shenyouchu.core.llm.settings.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shenyouchu.core.llm.settings.UserLlmSettings;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserLlmSettingsMapper extends BaseMapper<UserLlmSettings> {
}
