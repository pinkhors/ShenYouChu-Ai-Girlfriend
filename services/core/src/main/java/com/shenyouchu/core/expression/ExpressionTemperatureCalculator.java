package com.shenyouchu.core.expression;

import com.fasterxml.jackson.databind.JsonNode;
import com.shenyouchu.core.character.CharacterCatalog;
import com.shenyouchu.core.character.dto.PersonalityView;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 根据角色设定确定性地推导自动表达温度（文档 09 §7.1–§7.5）。
 *
 * <p>纯逻辑：不依赖 Spring，不读取数据库。未知 ID 一律按 0 处理，不抛异常。
 * <p>形象先验只读取 {@code outfitStyle} / {@code hairStyle} / {@code outfitColor}
 * 三个弱信号字段，绝不使用肤色、脸型、五官、体型等参数。
 */
public final class ExpressionTemperatureCalculator {

    private static final double BASE = 0.78;
    private static final double MODIFIER_LIMIT = 0.08;
    private static final double AVATAR_LIMIT = 0.05;
    private static final double AUTO_MIN = 0.50;
    private static final double AUTO_MAX = 0.95;

    private static final Map<String, Double> ARCHETYPE_OFFSETS = offsets(
            "gentle", -0.05,
            "tsundere", 0.03,
            "lively", 0.12,
            "cool", -0.12,
            "intellectual", -0.03,
            "lazy", 0.02,
            "reliable", -0.08,
            "whimsical", 0.15);

    private static final Map<String, Double> MODIFIER_OFFSETS = offsets(
            "soft-tsundere", 0.02,
            "affectionate", 0.03,
            "slow-warm", -0.06,
            "teasing", 0.04,
            "attentive", -0.02,
            "romantic", 0.03,
            "independent", -0.03,
            "clingy", 0.03);

    private static final Map<String, Double> INTENSITY_OFFSETS = offsets(
            "low", -0.08,
            "medium", 0.0,
            "high", 0.08);

    private static final Map<String, Double> OUTFIT_STYLE_OFFSETS = offsets(
            "sporty", 0.03,
            "campus", 0.02,
            "casual", 0.0,
            "knit", -0.01,
            "vintage", 0.01,
            "commute", -0.02,
            "home", -0.02);

    private static final Map<String, Double> HAIR_STYLE_OFFSETS = offsets(
            "twin-tails", 0.03,
            "ponytail", 0.02,
            "short", 0.02,
            "bob", 0.01,
            "long-wave", 0.01,
            "long-straight", -0.02,
            "updo", 0.0);

    private static final Map<String, Double> OUTFIT_COLOR_OFFSETS = offsets(
            "blush", 0.02,
            "cream", 0.01,
            "sage", -0.01,
            "ink", -0.02,
            "navy", -0.02);

    /** 与前端 avatarConfig.ts 保持一致的中文名，用于解释清单。 */
    private static final Map<String, String> OUTFIT_STYLE_LABELS = labels(
            "sporty", "运动活力",
            "campus", "校园清纯",
            "casual", "日常休闲",
            "knit", "温柔针织",
            "vintage", "复古文艺",
            "commute", "通勤简约",
            "home", "居家慵懒");

    private static final Map<String, String> HAIR_STYLE_LABELS = labels(
            "twin-tails", "双马尾",
            "ponytail", "高马尾",
            "short", "利落短发",
            "bob", "齐肩短发",
            "long-wave", "波浪长发",
            "long-straight", "长直发",
            "updo", "低盘发");

    private static final Map<String, String> OUTFIT_COLOR_LABELS = labels(
            "blush", "烟粉",
            "cream", "奶油白",
            "sage", "灰绿",
            "ink", "墨黑",
            "navy", "藏青");

    /**
     * 推导自动温度。
     *
     * @param personality 性格设定；{@code null} 视为主性格 0、强度 0、标签空
     * @param avatarConfig 形象 JSON；{@code null} 视为形象贡献 0
     */
    public ExpressionTemperature calculate(PersonalityView personality, JsonNode avatarConfig) {
        String archetypeId = personality == null ? null : personality.archetype();
        String intensityId = personality == null ? null : personality.intensity();

        double archetypeDelta = offset(ARCHETYPE_OFFSETS, archetypeId);
        double intensityDelta = offset(INTENSITY_OFFSETS, intensityId);

        List<String> modifierLabels = new ArrayList<>(2);
        double modifierSum = 0.0;
        if (personality != null && personality.modifiers() != null) {
            for (String modifierId : personality.modifiers()) {
                if (modifierId == null) {
                    continue;
                }
                Double delta = MODIFIER_OFFSETS.get(modifierId);
                if (delta == null) {
                    continue;
                }
                modifierSum += delta;
                addLabel(modifierLabels, CharacterCatalog.modifierLabel(modifierId));
            }
        }
        double modifierDelta = clamp(modifierSum, -MODIFIER_LIMIT, MODIFIER_LIMIT);

        String outfitStyle = text(avatarConfig, "outfitStyle");
        String hairStyle = text(avatarConfig, "hairStyle");
        String outfitColor = text(avatarConfig, "outfitColor");

        double outfitDelta = offset(OUTFIT_STYLE_OFFSETS, outfitStyle);
        double hairDelta = offset(HAIR_STYLE_OFFSETS, hairStyle);
        double colorDelta = offset(OUTFIT_COLOR_OFFSETS, outfitColor);
        double avatarDelta = clamp(outfitDelta + hairDelta + colorDelta, -AVATAR_LIMIT, AVATAR_LIMIT);

        double raw = BASE + archetypeDelta + modifierDelta + intensityDelta + avatarDelta;
        double autoTemperature = round2(clamp(raw, AUTO_MIN, AUTO_MAX));

        List<String> explanation = new ArrayList<>(6);
        explanation.add("基础 " + plain(BASE));
        explanation.add("主性格 " + archetypeLabel(archetypeId) + " " + signed(archetypeDelta));
        explanation.add("调味 " + (modifierLabels.isEmpty() ? "无" : String.join("、", modifierLabels))
                + " " + signed(modifierDelta));
        explanation.add("表达 " + intensityLabel(intensityId) + " " + signed(intensityDelta));
        explanation.add("形象 " + avatarLabel(hairStyle, hairDelta, outfitStyle, outfitDelta,
                outfitColor, colorDelta) + " " + signed(avatarDelta));
        explanation.add("夹取后 " + plain(autoTemperature));

        return new ExpressionTemperature(autoTemperature, explanation);
    }

    private static String archetypeLabel(String id) {
        if (isBlank(id)) {
            return "无";
        }
        String label = CharacterCatalog.archetypeLabel(id);
        return label.isBlank() ? "未知" : label;
    }

    private static String intensityLabel(String id) {
        if (isBlank(id)) {
            return "无";
        }
        return INTENSITY_OFFSETS.containsKey(id) ? CharacterCatalog.intensityLabel(id) : "未知";
    }

    /**
     * 形象行只列出实际产生贡献的字段（发型优先，与 §7.7 示例的叙述顺序一致）；
     * 全部为 0 时显示“无”。数字始终是三个字段夹取后的合计。
     */
    private static String avatarLabel(String hairStyle, double hairDelta,
                                      String outfitStyle, double outfitDelta,
                                      String outfitColor, double colorDelta) {
        List<String> labels = new ArrayList<>(3);
        if (hairDelta != 0.0) {
            addLabel(labels, HAIR_STYLE_LABELS.get(hairStyle));
        }
        if (outfitDelta != 0.0) {
            addLabel(labels, OUTFIT_STYLE_LABELS.get(outfitStyle));
        }
        if (colorDelta != 0.0) {
            addLabel(labels, OUTFIT_COLOR_LABELS.get(outfitColor));
        }
        return labels.isEmpty() ? "无" : String.join("、", labels);
    }

    private static void addLabel(List<String> labels, String label) {
        if (label != null && !label.isBlank() && !labels.contains(label)) {
            labels.add(label);
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null) {
            return "";
        }
        JsonNode value = node.get(field);
        if (value == null || value.isNull() || !value.isValueNode()) {
            return "";
        }
        return value.asText("");
    }

    private static double offset(Map<String, Double> offsets, String id) {
        if (id == null) {
            return 0.0;
        }
        Double delta = offsets.get(id);
        return delta == null ? 0.0 : delta;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private static String plain(double value) {
        return String.format(Locale.ROOT, "%.2f", value);
    }

    private static String signed(double value) {
        String formatted = String.format(Locale.ROOT, "%+.2f", value);
        return "-0.00".equals(formatted) ? "+0.00" : formatted;
    }

    private static Map<String, Double> offsets(Object... entries) {
        Map<String, Double> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put((String) entries[index], (Double) entries[index + 1]);
        }
        return Map.copyOf(map);
    }

    private static Map<String, String> labels(String... entries) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(entries[index], entries[index + 1]);
        }
        return Map.copyOf(map);
    }
}
