package com.shenyouchu.core.persona;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import org.springframework.stereotype.Service;

/**
 * 把人设配置组装为系统提示词。
 *
 * <p>保留原构造器签名以兼容既有调用；具体拼装委托给 {@link CharacterPromptCompiler}：
 * 官方角色走旧 v1 分支（输出不变），自定义角色走 v2 分支（边界最后追加）。
 */
@Service
public class PersonaService {

    private final CharacterMapper characterMapper;
    private final CharacterPromptCompiler promptCompiler;

    public PersonaService(CharacterMapper characterMapper, ObjectMapper objectMapper) {
        this.characterMapper = characterMapper;
        this.promptCompiler = new CharacterPromptCompiler(objectMapper);
    }

    public String systemPrompt(Long characterId) {
        CharacterProfile character = characterId == null
                ? characterMapper.selectOne(Wrappers.<CharacterProfile>lambdaQuery()
                        .eq(CharacterProfile::getCode, "shenyouchu"))
                : characterMapper.selectById(characterId);
        if (character == null) {
            throw ApiException.notFound("角色不存在，请先执行数据库迁移");
        }
        return promptCompiler.compile(character);
    }
}
