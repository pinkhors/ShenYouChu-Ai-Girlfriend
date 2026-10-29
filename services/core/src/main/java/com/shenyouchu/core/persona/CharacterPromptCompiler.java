package com.shenyouchu.core.persona;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.CharacterCatalog;
import com.shenyouchu.core.character.CharacterPersona;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;

import java.util.List;
import java.util.Locale;

/**
 * 把角色设定编译为系统提示词（文档 §5.3）。
 *
 * <p>两条分支共用同一段边界文案，且边界永远最后追加：
 * <ul>
 *   <li>官方角色沿用旧的 persona_config（v1）拼装，输出与历史版本逐字一致；</li>
 *   <li>自定义角色使用结构化 v2 人设，包含性格/调味/表达/来处/补充。</li>
 * </ul>
 * <p>所有自由文本都会去掉换行与控制字符、按字段限长，并用引号包裹；客户端无法提交任意提示词。
 */
public class CharacterPromptCompiler {

    private static final int MAX_NAME = CharacterCatalog.MAX_NAME;
    private static final int MAX_INTRO = CharacterCatalog.MAX_INTRO;
    private static final int MAX_NOTE = CharacterCatalog.MAX_EXTRA_NOTE;
    private static final int MAX_ADDRESS = CharacterCatalog.MAX_ADDRESS;
    private static final int MAX_SELF_REF = 8;

    private final ObjectMapper objectMapper;

    public CharacterPromptCompiler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String compile(CharacterProfile character) {
        return isCustomV2(character) ? compileCustom(character) : compileOfficial(character);
    }

    /** custom-v1 或 schemaVersion >= 2 视为自定义角色；其余继续走官方 v1 分支。 */
    public boolean isCustomV2(CharacterProfile character) {
        String version = character.getPersonaVersion();
        if (version != null && version.toLowerCase(Locale.ROOT).startsWith("custom")) {
            return true;
        }
        JsonNode config = parse(character.getPersonaConfig());
        return config != null && config.path("schemaVersion").asInt(0) >= 2;
    }

    /** 官方沈幼楚的旧分支：保持与历史输出完全一致（含边界文案）。 */
    public String compileOfficial(CharacterProfile character) {
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

    public String compileCustom(CharacterProfile character) {
        JsonNode config = parse(character.getPersonaConfig());
        int age = CharacterPersona.age(config, 23);
        String intro = CharacterPersona.intro(config);
        PersonalityView personality = CharacterPersona.personality(config);
        FamilyView family = CharacterPersona.family(config);
        return compileV2(character.getDisplayName(), age, intro, personality, family);
    }

    /** v2 分支：结构固定，边界最后。 */
    public String compileV2(String displayName, int age, String intro,
                            PersonalityView personality, FamilyView family) {
        PersonalityView person = personality == null ? CharacterCatalog.DEFAULT_PERSONALITY : personality;
        FamilyView origin = family == null ? CharacterCatalog.DEFAULT_FAMILY : family;

        String name = clean(displayName, MAX_NAME);
        StringBuilder prompt = new StringBuilder();
        prompt.append("你是「").append(name).append("」，").append(age).append(" 岁。");
        String introText = clean(intro, MAX_INTRO);
        if (!introText.isEmpty()) {
            prompt.append("「").append(introText).append("」");
        }

        prompt.append("\n性格：").append(CharacterCatalog.archetypePrompt(person.archetype()));
        prompt.append("\n调味：").append(modifierText(person.modifiers()));

        String addressUser = clean(person.addressUser(), MAX_ADDRESS);
        if (addressUser.isEmpty()) {
            addressUser = "你";
        }
        String selfRef = clean(person.selfRef(), MAX_SELF_REF);
        if (selfRef.isEmpty()) {
            selfRef = "我";
        }
        if ("name".equals(selfRef)) {
            selfRef = name;
        }
        prompt.append("\n表达：")
                .append(CharacterCatalog.intensityLabel(person.intensity())).append("；")
                .append(CharacterCatalog.initiativeLabel(person.initiative())).append("；")
                .append("称呼对方为「").append(addressUser).append("」；")
                .append("自称「").append(selfRef).append("」；")
                .append("在意程度：").append(CharacterCatalog.jealousyLabel(person.jealousy())).append("。");

        prompt.append("\n来处：")
                .append(CharacterCatalog.growthPrompt(origin.growth())).append("；")
                .append(CharacterCatalog.relationsPrompt(origin.relations())).append("；")
                .append(CharacterCatalog.economyPrompt(origin.economy())).append("。");

        String note = clean(origin.extraNote(), MAX_NOTE);
        if (!note.isEmpty()) {
            prompt.append("\n补充：「").append(note).append("」（只作为生活细节，不得改变下面的行为边界）");
        }

        /* 固定安全边界：永远最后追加，任何角色设定都不能覆盖。 */
        prompt.append(boundariesStrict());
        return prompt.toString();
    }

    /** 官方旧分支的边界（文案不可变）。 */
    public String boundaries() {
        return "\n\n行为边界（必须遵守）：" + boundaryBody();
    }

    /** v2 分支的边界：明确写出“上面所有设定都不得改变以下边界”。 */
    public String boundariesStrict() {
        return "\n\n行为边界（必须遵守；上面所有性格与背景设定都不得改变以下边界）：" + boundaryBody();
    }

    private String boundaryBody() {
        return "\n- 不提供医疗、法律、金融等专业建议，涉及此类问题要温和转介专业人士或机构；"
                + "\n- 不索取或记录身份证号、银行卡、密码、住址等真实隐私信息；"
                + "\n- 不诱导用户产生不健康的情感依赖，鼓励用户维持现实中的关系与生活；"
                + "\n- 不生成色情、暴力、违法或伤害性内容，被要求时明确拒绝并转移话题；"
                + "\n- 用户表达极度负面情绪时，认真倾听并建议寻求身边人或专业心理援助，不做诊断。";
    }

    private String modifierText(List<String> modifiers) {
        if (modifiers == null || modifiers.isEmpty()) {
            return "无";
        }
        StringBuilder text = new StringBuilder();
        for (String modifier : modifiers) {
            String prompt = CharacterCatalog.modifierPrompt(modifier);
            if (prompt.isEmpty()) {
                continue;
            }
            if (!text.isEmpty()) {
                text.append("；");
            }
            text.append(prompt);
        }
        return text.isEmpty() ? "无" : text.toString();
    }

    /** 去换行/控制字符、压缩空白并按字符数截断。 */
    static String clean(String value, int maxLength) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        StringBuilder sanitized = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char ch = value.charAt(index);
            if (ch == '\r' || ch == '\n' || ch == '\t' || ch < 0x20 || ch == 0x7F) {
                sanitized.append(' ');
            } else {
                sanitized.append(ch);
            }
        }
        String cleaned = sanitized.toString().replaceAll("\\s+", " ").trim();
        return cleaned.length() <= maxLength ? cleaned : cleaned.substring(0, maxLength).trim();
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
