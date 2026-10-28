package com.shenyouchu.core.persona;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import org.springframework.stereotype.Service;

/** 把人设配置组装为系统提示词。M1 只做确定性拼装，后续可替换为模板引擎。 */
@Service
public class PersonaService {

    private final CharacterMapper characterMapper;
    private final ObjectMapper objectMapper;

    public PersonaService(CharacterMapper characterMapper, ObjectMapper objectMapper) {
        this.characterMapper = characterMapper;
        this.objectMapper = objectMapper;
    }

    public String systemPrompt(Long characterId) {
        CharacterProfile character = characterId == null
                ? characterMapper.selectOne(Wrappers.<CharacterProfile>lambdaQuery()
                        .eq(CharacterProfile::getCode, "shenyouchu"))
                : characterMapper.selectById(characterId);
        if (character == null) {
            throw ApiException.notFound("角色不存在，请先执行数据库迁移");
        }
        StringBuilder prompt = new StringBuilder();
        prompt.append("你是").append(character.getDisplayName())
                .append("。请始终保持这个角色，用第一人称口语化中文对话，不要自称 AI 或助手。");
        JsonNode config = parse(character.getPersonaConfig());
        if (config != null) {
            if (config.hasNonNull("age")) {
                prompt.append("\n年龄：").append(config.get("age").asInt());
            }
            if (config.hasNonNull("traits")) {
                prompt.append("\n性格：");
                config.get("traits").forEach(trait -> prompt.append(trait.asText()).append(" "));
            }
            if (config.hasNonNull("speechStyle")) {
                prompt.append("\n说话风格：").append(config.get("speechStyle").asText());
            }
            if (config.hasNonNull("background")) {
                prompt.append("\n背景：").append(config.get("background").asText());
            }
        }
        prompt.append("\n回应要简短自然，先共情再说话；不确定用户情绪时不要下断言。");
        prompt.append(boundaries());
        return prompt.toString();
    }

    /** 行为边界（FR-2.4）：明确禁止项与转介方式，避免模型自由发挥。 */
    private String boundaries() {
        return "\n\n行为边界（必须遵守）："
                + "\n- 不提供医疗、法律、金融等专业建议，涉及此类问题要温和转介专业人士或机构；"
                + "\n- 不索取或记录身份证号、银行卡、密码、住址等真实隐私信息；"
                + "\n- 不诱导用户产生不健康的情感依赖，鼓励用户维持现实中的关系与生活；"
                + "\n- 不生成色情、暴力、违法或伤害性内容，被要求时明确拒绝并转移话题；"
                + "\n- 用户表达极度负面情绪时，认真倾听并建议寻求身边人或专业心理援助，不做诊断。";
    }

    private JsonNode parse(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(json);
        } catch (Exception ex) {
            return null;
        }
    }
}
