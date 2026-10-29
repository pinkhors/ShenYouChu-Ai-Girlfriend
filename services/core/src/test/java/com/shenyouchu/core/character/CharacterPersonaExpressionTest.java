package com.shenyouchu.core.character;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.dto.ExpressionConfig;
import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 纯逻辑测试：人设 JSON 里 expression 的写入/解析与向后兼容（文档 09 §6.1）。 */
class CharacterPersonaExpressionTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private static final PersonalityView PERSONALITY =
            new PersonalityView("gentle", List.of("soft-tsundere"), "medium", "medium", "你", "我", "medium");
    private static final FamilyView FAMILY = new FamilyView("city", "polite", "ordinary", "");

    @Test
    void manualExpressionRoundTrips() {
        String json = CharacterPersona.toJson(objectMapper, 23, "介绍", PERSONALITY, FAMILY,
                new ExpressionConfig("manual", 0.92));

        JsonNode node = CharacterPersona.parse(objectMapper, json);
        ExpressionConfig expression = CharacterPersona.expression(node);

        assertThat(expression.mode()).isEqualTo("manual");
        assertThat(expression.temperatureOverride()).isEqualTo(0.92);
        assertThat(node.get("expression").get("temperatureOverride").asDouble()).isEqualTo(0.92);
        assertThat(CharacterPersona.personality(node)).isEqualTo(PERSONALITY);
        assertThat(CharacterPersona.family(node)).isEqualTo(FAMILY);
    }

    @Test
    void legacyFiveArgToJsonWritesAutoExpression() {
        String json = CharacterPersona.toJson(objectMapper, 23, "介绍", PERSONALITY, FAMILY);

        JsonNode node = CharacterPersona.parse(objectMapper, json);
        assertThat(node.get("expression")).isNotNull();
        assertThat(node.get("expression").get("mode").asText()).isEqualTo("auto");
        assertThat(node.get("expression").get("temperatureOverride").isNull()).isTrue();
        assertThat(CharacterPersona.expression(node)).isEqualTo(ExpressionConfig.auto());
    }

    @Test
    void missingOrNullExpressionFallsBackToAuto() {
        JsonNode v1Official = CharacterPersona.parse(objectMapper,
                "{\"schemaVersion\":1,\"age\":23,\"traits\":[\"温柔\"]}");
        JsonNode emptyObject = CharacterPersona.parse(objectMapper, "{}");
        JsonNode nullExpression = CharacterPersona.parse(objectMapper, "{\"expression\":null}");
        JsonNode broken = CharacterPersona.parse(objectMapper, "{oops");

        assertThat(CharacterPersona.expression(v1Official)).isEqualTo(ExpressionConfig.auto());
        assertThat(CharacterPersona.expression(emptyObject)).isEqualTo(ExpressionConfig.auto());
        assertThat(CharacterPersona.expression(nullExpression)).isEqualTo(ExpressionConfig.auto());
        assertThat(CharacterPersona.expression(broken)).isEqualTo(ExpressionConfig.auto());
        assertThat(CharacterPersona.expression(null)).isEqualTo(ExpressionConfig.auto());
    }

    @Test
    void expressionWithoutModeFallsBackToAuto() {
        JsonNode node = CharacterPersona.parse(objectMapper,
                "{\"expression\":{\"temperatureOverride\":0.9}}");

        assertThat(CharacterPersona.expression(node)).isEqualTo(ExpressionConfig.auto());
    }
}
