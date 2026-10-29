package com.shenyouchu.core.character;

import com.fasterxml.jackson.databind.JsonNode;
import com.shenyouchu.core.character.dto.ExpressionConfig;
import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;
import com.shenyouchu.core.common.ApiException;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 角色设定校验（文档 §3.7 / §5.5）。
 *
 * <p>所有失败都抛带稳定错误码的 {@link ApiException}，HTTP 状态与前端提示一致：
 * 名称/年龄/长度/枚举 → 400；重名/超限/版本冲突 → 409（重名与超限由 CharacterService 判断）。
 * <p>自由文本在这里统一去换行/控制字符并限长；提示词编译时再做一次防御性清洗。
 */
@Component
public class CharacterValidator {

    private static final String CODE_NAME_INVALID = "CHARACTER_NAME_INVALID";
    private static final String CODE_AGE_OUT_OF_RANGE = "CHARACTER_AGE_OUT_OF_RANGE";
    private static final String CODE_OPTION_INVALID = "CHARACTER_OPTION_INVALID";
    private static final String CODE_NOTE_TOO_LONG = "CHARACTER_NOTE_TOO_LONG";
    private static final String CODE_EXPRESSION_INVALID = "CHARACTER_EXPRESSION_INVALID";

    /** 手动表达温度的允许区间（文档 09 §6.1）。 */
    private static final double TEMPERATURE_MIN = 0.30;
    private static final double TEMPERATURE_MAX = 1.20;

    /** 名称：去首尾空格、2–12 字符、禁止换行/控制字符。 */
    public String normalizeName(String raw) {
        String name = raw == null ? "" : raw.trim();
        if (name.length() < CharacterCatalog.MIN_NAME || name.length() > CharacterCatalog.MAX_NAME) {
            throw ApiException.badRequest(CODE_NAME_INVALID, "名字需要 2–12 个字符，且不能与已有角色重名。");
        }
        if (containsControlCharacter(name)) {
            throw ApiException.badRequest(CODE_NAME_INVALID, "名字不能包含换行或控制字符。");
        }
        return name;
    }

    /** 年龄：18–45 整数；缺省用 23（空白模板默认值）。 */
    public int normalizeAge(Integer age) {
        int value = age == null ? 23 : age;
        if (value < CharacterCatalog.MIN_AGE || value > CharacterCatalog.MAX_AGE) {
            throw ApiException.badRequest(CODE_AGE_OUT_OF_RANGE, "年龄需在 18–45 岁之间。");
        }
        return value;
    }

    /** 一句话介绍：≤40 字符、禁止换行/控制字符，可空。 */
    public String normalizeIntro(String raw) {
        String intro = raw == null ? "" : raw.trim();
        if (containsControlCharacter(intro)) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "一句话介绍不能包含换行或控制字符。");
        }
        if (intro.length() > CharacterCatalog.MAX_INTRO) {
            throw ApiException.badRequest(CODE_NOTE_TOO_LONG, "一句话介绍最多 40 个字符。");
        }
        return intro;
    }

    /** 补充设定：≤60 字符、禁止换行/控制字符，可空。 */
    public String normalizeExtraNote(String raw) {
        String note = raw == null ? "" : raw.trim();
        if (containsControlCharacter(note)) {
            throw ApiException.badRequest(CODE_NOTE_TOO_LONG, "补充设定最多 60 个字符，且不能换行。");
        }
        if (note.length() > CharacterCatalog.MAX_EXTRA_NOTE) {
            throw ApiException.badRequest(CODE_NOTE_TOO_LONG, "补充设定最多 60 个字符，且不能换行。");
        }
        return note;
    }

    /** 性格：主性格必选、调味标签 ≤2 且白名单、独立/黏人互斥、三档枚举与称呼/自称校验。 */
    public PersonalityView normalizePersonality(PersonalityView input) {
        PersonalityView source = input == null ? CharacterCatalog.DEFAULT_PERSONALITY : input;
        String archetype = trimToNull(source.archetype());
        if (archetype == null || !CharacterCatalog.archetypeIds().contains(archetype)) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "请选择一个主性格。");
        }

        List<String> modifiers = new ArrayList<>();
        if (source.modifiers() != null) {
            for (String modifier : source.modifiers()) {
                String id = trimToNull(modifier);
                if (id == null || !CharacterCatalog.modifierIds().contains(id)) {
                    throw ApiException.badRequest(CODE_OPTION_INVALID, "调味标签不在允许范围内。");
                }
                if (!modifiers.contains(id)) {
                    modifiers.add(id);
                }
            }
        }
        if (modifiers.size() > CharacterCatalog.MAX_MODIFIERS) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "调味标签最多选择 2 个。");
        }
        if (modifiers.contains("independent") && modifiers.contains("clingy")) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "“独立”和“黏人”不能同时选择。");
        }

        String intensity = normalizeLevel(source.intensity(), "medium");
        String initiative = normalizeLevel(source.initiative(), "medium");
        String jealousy = normalizeLevel(source.jealousy(), "medium");

        String addressUser = trimToNull(source.addressUser());
        if (addressUser == null) {
            addressUser = "你";
        }
        if (addressUser.length() > CharacterCatalog.MAX_ADDRESS || containsControlCharacter(addressUser)) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "称呼需为 1–6 个字，且不能换行。");
        }

        String selfRef = trimToNull(source.selfRef());
        if (selfRef == null) {
            selfRef = "我";
        }
        if (!CharacterCatalog.SELF_REF_IDS.contains(selfRef)) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "自称不在允许范围内。");
        }

        return new PersonalityView(archetype, List.copyOf(modifiers), intensity, initiative,
                addressUser, selfRef, jealousy);
    }

    /** 家庭背景：三个维度白名单，缺省用中性默认值；补充设定限长。 */
    public FamilyView normalizeFamily(FamilyView input) {
        FamilyView source = input == null ? CharacterCatalog.DEFAULT_FAMILY : input;
        String growth = normalizeOption(source.growth(), CharacterCatalog.growthIds(), "city", "成长环境不在允许范围内。");
        String relations = normalizeOption(source.relations(), CharacterCatalog.relationsIds(), "polite",
                "家庭关系不在允许范围内。");
        String economy = normalizeOption(source.economy(), CharacterCatalog.economyIds(), "ordinary",
                "经济状况不在允许范围内。");
        return new FamilyView(growth, relations, economy, normalizeExtraNote(source.extraNote()));
    }

    /**
     * 形象配置：必须是 JSON 对象、≤8KB；outfitStyle 可选但必须在白名单内。
     * 空值返回官方默认形象，保证 CharacterView.avatarConfig 永远是完整对象。
     */
    public String normalizeAvatarConfig(JsonNode avatarConfig) {
        if (avatarConfig == null || avatarConfig.isNull() || avatarConfig.isMissingNode()) {
            return CharacterCatalog.DEFAULT_AVATAR_JSON;
        }
        if (!avatarConfig.isObject()) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "形象配置必须是 JSON 对象。");
        }
        String json = avatarConfig.toString();
        if (json.getBytes(StandardCharsets.UTF_8).length > CharacterCatalog.MAX_AVATAR_BYTES) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "形象配置过大，最多 8KB。");
        }
        JsonNode outfitStyle = avatarConfig.get("outfitStyle");
        if (outfitStyle != null && !outfitStyle.isNull()) {
            if (!outfitStyle.isTextual() || !CharacterCatalog.OUTFIT_STYLES.contains(outfitStyle.asText())) {
                throw ApiException.badRequest(CODE_OPTION_INVALID, "服饰风格不在允许范围内。");
            }
        }
        return json;
    }

    /**
     * 表达温度配置：缺省/null/空对象回退 auto；mode 只允许 auto/manual；
     * manual 必须携带 0.30–1.20 的 override（四舍五入到 2 位）；auto 时 override 置 null。
     *
     * <p>任何非法输入都抛 400 {@code CHARACTER_EXPRESSION_INVALID}，不静默回退。
     */
    public ExpressionConfig normalizeExpression(ExpressionConfig input) {
        if (input == null) {
            return ExpressionConfig.auto();
        }
        String rawMode = trimToNull(input.mode());
        if (rawMode == null) {
            /* expression 为空对象（{}）等价于缺省。 */
            return ExpressionConfig.auto();
        }
        String mode = rawMode.toLowerCase(Locale.ROOT);
        if (ExpressionConfig.MODE_AUTO.equals(mode)) {
            return ExpressionConfig.auto();
        }
        if (!ExpressionConfig.MODE_MANUAL.equals(mode)) {
            throw expressionInvalid("表达温度设置不合法，请重试。");
        }
        Double override = input.temperatureOverride();
        if (override == null || !Double.isFinite(override)
                || override < TEMPERATURE_MIN || override > TEMPERATURE_MAX) {
            throw expressionInvalid("手动表达温度需在 0.30–1.20 之间。");
        }
        return new ExpressionConfig(ExpressionConfig.MODE_MANUAL, round2(override));
    }

    /** 彻底删除时的确认名必须与角色名一致。 */
    public void requireConfirmName(String displayName, String confirmName) {
        String expected = displayName == null ? "" : displayName.trim();
        String actual = confirmName == null ? "" : confirmName.trim();
        if (!expected.equals(actual)) {
            throw ApiException.conflict("CHARACTER_CONFIRM_MISMATCH", "确认名字与角色名不一致，请重新输入。");
        }
    }

    private String normalizeLevel(String raw, String fallback) {
        String level = trimToNull(raw);
        if (level == null) {
            return fallback;
        }
        if (!CharacterCatalog.levelIds().contains(level)) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, "表达选项不在允许范围内。");
        }
        return level;
    }

    private String normalizeOption(String raw, java.util.Set<String> allowed, String fallback, String message) {
        String id = trimToNull(raw);
        if (id == null) {
            return fallback;
        }
        if (!allowed.contains(id)) {
            throw ApiException.badRequest(CODE_OPTION_INVALID, message);
        }
        return id;
    }

    private static ApiException expressionInvalid(String message) {
        return ApiException.badRequest(CODE_EXPRESSION_INVALID, message);
    }

    private static double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private static boolean containsControlCharacter(String text) {
        for (int index = 0; index < text.length(); index++) {
            char ch = text.charAt(index);
            if (ch < 0x20 || ch == 0x7F) {
                return true;
            }
        }
        return false;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
