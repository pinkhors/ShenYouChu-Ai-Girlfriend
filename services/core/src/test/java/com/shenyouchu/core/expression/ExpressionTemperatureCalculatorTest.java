package com.shenyouchu.core.expression;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.shenyouchu.core.character.dto.PersonalityView;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ExpressionTemperatureCalculatorTest {

    private final ExpressionTemperatureCalculator calculator = new ExpressionTemperatureCalculator();

    @Test
    void mapsEveryArchetype() {
        Map<String, Double> expected = new LinkedHashMap<>();
        expected.put("gentle", 0.73);
        expected.put("tsundere", 0.81);
        expected.put("lively", 0.90);
        expected.put("cool", 0.66);
        expected.put("intellectual", 0.75);
        expected.put("lazy", 0.80);
        expected.put("reliable", 0.70);
        expected.put("whimsical", 0.93);

        expected.forEach((id, value) ->
                assertEquals(value, auto(id, List.of(), "medium", null), 1e-9, "archetype " + id));
    }

    @Test
    void mapsEveryModifier() {
        Map<String, Double> expected = new LinkedHashMap<>();
        expected.put("soft-tsundere", 0.80);
        expected.put("affectionate", 0.81);
        expected.put("slow-warm", 0.72);
        expected.put("teasing", 0.82);
        expected.put("attentive", 0.76);
        expected.put("romantic", 0.81);
        expected.put("independent", 0.75);
        expected.put("clingy", 0.81);

        expected.forEach((id, value) ->
                assertEquals(value, auto(null, List.of(id), null, null), 1e-9, "modifier " + id));
    }

    @Test
    void mapsEveryIntensity() {
        assertEquals(0.70, auto(null, List.of(), "low", null), 1e-9);
        assertEquals(0.78, auto(null, List.of(), "medium", null), 1e-9);
        assertEquals(0.86, auto(null, List.of(), "high", null), 1e-9);
        assertEquals(0.78, auto(null, List.of(), "unknown", null), 1e-9);
    }

    @Test
    void mapsEveryOutfitStyle() {
        Map<String, Double> expected = new LinkedHashMap<>();
        expected.put("sporty", 0.81);
        expected.put("campus", 0.80);
        expected.put("casual", 0.78);
        expected.put("knit", 0.77);
        expected.put("vintage", 0.79);
        expected.put("commute", 0.76);
        expected.put("home", 0.76);
        expected.put("unknown", 0.78);

        expected.forEach((id, value) ->
                assertEquals(value, auto(null, List.of(), null, avatar(id, null, null)), 1e-9,
                        "outfitStyle " + id));
    }

    @Test
    void mapsEveryHairStyle() {
        Map<String, Double> expected = new LinkedHashMap<>();
        expected.put("twin-tails", 0.81);
        expected.put("ponytail", 0.80);
        expected.put("short", 0.80);
        expected.put("bob", 0.79);
        expected.put("long-wave", 0.79);
        expected.put("long-straight", 0.76);
        expected.put("updo", 0.78);
        expected.put("unknown", 0.78);

        expected.forEach((id, value) ->
                assertEquals(value, auto(null, List.of(), null, avatar(null, id, null)), 1e-9,
                        "hairStyle " + id));
    }

    @Test
    void mapsEveryOutfitColor() {
        Map<String, Double> expected = new LinkedHashMap<>();
        expected.put("blush", 0.80);
        expected.put("cream", 0.79);
        expected.put("sage", 0.77);
        expected.put("ink", 0.76);
        expected.put("navy", 0.76);
        expected.put("unknown", 0.78);

        expected.forEach((id, value) ->
                assertEquals(value, auto(null, List.of(), null, avatar(null, null, id)), 1e-9,
                        "outfitColor " + id));
    }

    @Test
    void clampsModifierSumToEightHundredths() {
        assertEquals(0.86, auto(null, List.of("affectionate", "teasing", "romantic"), null, null), 1e-9);
        assertEquals(0.70, auto(null, List.of("slow-warm", "attentive", "independent"), null, null), 1e-9);
    }

    @Test
    void clampsAvatarSumToFiveHundredths() {
        assertEquals(0.83, auto(null, List.of(), null, avatar("sporty", "twin-tails", "blush")), 1e-9);
        assertEquals(0.73, auto(null, List.of(), null, avatar("home", "long-straight", "ink")), 1e-9);
    }

    @Test
    void matchesPrdExamples() {
        ExpressionTemperature first = calculator.calculate(
                personality("gentle", List.of("soft-tsundere"), "medium"),
                avatar("casual", "long-straight", "cream"));
        assertEquals(0.74, first.autoTemperature(), 1e-9);

        ExpressionTemperature second = calculator.calculate(
                personality("lively", List.of("affectionate"), "high"),
                avatar("sporty", "twin-tails", "blush"));
        assertEquals(0.95, second.autoTemperature(), 1e-9);

        ExpressionTemperature third = calculator.calculate(
                personality("cool", List.of("slow-warm"), "low"),
                avatar("commute", "short", "ink"));
        assertEquals(0.50, third.autoTemperature(), 1e-9);
    }

    @Test
    void explainsContributionsInFixedOrder() {
        ExpressionTemperature result = calculator.calculate(
                personality("gentle", List.of("soft-tsundere"), "medium"),
                avatar("casual", "long-straight", "cream"));

        assertEquals(List.of(
                "基础 0.78",
                "主性格 温柔治愈 -0.05",
                "调味 小傲娇 +0.02",
                "表达 自然 +0.00",
                "形象 长直发、奶油白 -0.01",
                "夹取后 0.74"), result.explanation());
    }

    @Test
    void explanationShowsClampedSums() {
        ExpressionTemperature high = calculator.calculate(
                personality("lively", List.of("affectionate"), "high"),
                avatar("sporty", "twin-tails", "blush"));
        assertEquals("主性格 活泼元气 +0.12", high.explanation().get(1));
        assertEquals("调味 爱撒娇 +0.03", high.explanation().get(2));
        assertEquals("表达 明显 +0.08", high.explanation().get(3));
        assertEquals("形象 双马尾、运动活力、烟粉 +0.05", high.explanation().get(4));
        assertEquals("夹取后 0.95", high.explanation().get(5));

        ExpressionTemperature low = calculator.calculate(
                personality("cool", List.of("slow-warm"), "low"),
                avatar("commute", "short", "ink"));
        assertEquals("主性格 清冷慢热 -0.12", low.explanation().get(1));
        assertEquals("调味 慢热 -0.06", low.explanation().get(2));
        assertEquals("表达 克制 -0.08", low.explanation().get(3));
        assertEquals("形象 利落短发、通勤简约、墨黑 -0.02", low.explanation().get(4));
        assertEquals("夹取后 0.50", low.explanation().get(5));

        ExpressionTemperature modifierClamp = calculator.calculate(
                personality(null, List.of("affectionate", "teasing", "romantic"), null), null);
        assertEquals("调味 爱撒娇、爱吐槽、浪漫 +0.08", modifierClamp.explanation().get(2));

        ExpressionTemperature avatarClamp = calculator.calculate(
                null, avatar("home", "long-straight", "ink"));
        assertEquals("形象 长直发、居家慵懒、墨黑 -0.05", avatarClamp.explanation().get(4));
    }

    @Test
    void usesDefaultsForNullInputs() {
        ExpressionTemperature result = calculator.calculate(null, null);
        assertEquals(0.78, result.autoTemperature(), 1e-9);
        assertEquals(List.of(
                "基础 0.78",
                "主性格 无 +0.00",
                "调味 无 +0.00",
                "表达 无 +0.00",
                "形象 无 +0.00",
                "夹取后 0.78"), result.explanation());

        ExpressionTemperature unknown = calculator.calculate(
                personality("not-a-real-archetype", List.of("not-a-tag"), "not-an-intensity"), null);
        assertEquals(0.78, unknown.autoTemperature(), 1e-9);
        assertEquals("主性格 未知 +0.00", unknown.explanation().get(1));
        assertEquals("调味 无 +0.00", unknown.explanation().get(2));
        assertEquals("表达 未知 +0.00", unknown.explanation().get(3));
    }

    @Test
    void toleratesNullModifierEntries() {
        PersonalityView personality = new PersonalityView(
                "gentle", Arrays.asList("soft-tsundere", null), "medium", "medium", "你", "我", "medium");
        assertEquals(0.75, calculator.calculate(personality, null).autoTemperature(), 1e-9);
        assertEquals("调味 小傲娇 +0.02", calculator.calculate(personality, null).explanation().get(2));
    }

    @Test
    void ignoresMalformedAvatarFields() {
        ObjectNode avatar = JsonNodeFactory.instance.objectNode();
        avatar.putNull("hairStyle");
        avatar.put("outfitStyle", 3);
        avatar.putArray("outfitColor").add("blush");
        avatar.put("skinTone", "pale");

        ExpressionTemperature result = calculator.calculate(null, avatar);
        assertEquals(0.78, result.autoTemperature(), 1e-9);
        assertEquals("形象 无 +0.00", result.explanation().get(4));
    }

    @Test
    void clampsAutomaticTemperatureToFloorAndCeiling() {
        PersonalityView ceiling = personality("whimsical", List.of("teasing", "romantic"), "high");
        assertEquals(0.95, calculator.calculate(ceiling, avatar("sporty", "twin-tails", "blush"))
                .autoTemperature(), 1e-9);

        PersonalityView floor = personality("cool", List.of("slow-warm", "attentive"), "low");
        assertEquals(0.50, calculator.calculate(floor, avatar("commute", "long-straight", "ink"))
                .autoTemperature(), 1e-9);
    }

    private double auto(String archetype, List<String> modifiers, String intensity, JsonNode avatar) {
        return calculator.calculate(personality(archetype, modifiers, intensity), avatar).autoTemperature();
    }

    private static PersonalityView personality(String archetype, List<String> modifiers, String intensity) {
        return new PersonalityView(archetype, modifiers, intensity, "medium", "你", "我", "medium");
    }

    private static JsonNode avatar(String outfitStyle, String hairStyle, String outfitColor) {
        ObjectNode node = JsonNodeFactory.instance.objectNode();
        if (outfitStyle != null) {
            node.put("outfitStyle", outfitStyle);
        }
        if (hairStyle != null) {
            node.put("hairStyle", hairStyle);
        }
        if (outfitColor != null) {
            node.put("outfitColor", outfitColor);
        }
        return node;
    }
}
