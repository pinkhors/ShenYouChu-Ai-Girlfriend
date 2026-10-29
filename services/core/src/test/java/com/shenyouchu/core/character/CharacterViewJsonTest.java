package com.shenyouchu.core.character;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.dto.CharacterView;
import com.shenyouchu.core.character.dto.ExpressionView;
import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 纯逻辑测试：CharacterView 的 JSON 字段名必须与前端契约一致，人设 JSON 可往返。 */
class CharacterViewJsonTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void viewSerializesContractFieldNames() throws Exception {
        CharacterView view = new CharacterView(
                "1000000000000000002",
                "custom-1000000000000000002",
                "林晚",
                false,
                true,
                "active",
                24,
                "刚搬来这座城市，路痴但嘴硬。",
                List.of("傲娇嘴硬", "小傲娇", "都市长大", "普通"),
                objectMapper.readTree("{\"skinTone\":\"natural\",\"outfitStyle\":\"knit\"}"),
                new PersonalityView("tsundere", List.of("soft-tsundere"), "medium", "medium",
                        "笨蛋", "我", "low"),
                new FamilyView("city", "polite", "ordinary", "怕打雷"),
                3,
                Instant.parse("2026-10-28T09:00:00Z"),
                Instant.parse("2026-10-28T10:00:00Z"),
                new ExpressionView("auto", null, 0.74, 0.74, "auto",
                        List.of("基础 0.78", "主性格 温柔治愈 -0.05", "夹取后 0.74")));

        String json = objectMapper.writeValueAsString(view);

        assertThat(json).contains("\"isOfficial\":false");
        assertThat(json).contains("\"isActive\":true");
        assertThat(json).contains("\"avatarConfig\":{");
        assertThat(json).contains("\"personality\":{");
        assertThat(json).contains("\"family\":{");
        assertThat(json).contains("\"expression\":{");
        assertThat(json).contains("\"autoTemperature\":0.74");
        assertThat(json).contains("\"effectiveTemperature\":0.74");
        assertThat(json).contains("\"source\":\"auto\"");
        assertThat(json).contains("\"displayName\":\"林晚\"");
        assertThat(json).contains("\"status\":\"active\"");
        assertThat(json).contains("\"version\":3");
        assertThat(json).contains("\"createdAt\":\"2026-10-28T09:00:00Z\"");
        assertThat(json).doesNotContain("\"official\"");
        assertThat(json).doesNotContain("\"active\":true");
        assertThat(json).doesNotContain("personaConfig");
    }

    @Test
    void officialCharacterHasNullExpression() throws Exception {
        CharacterView view = new CharacterView(
                "1000000000000000001",
                "shenyouchu",
                "沈幼楚",
                true,
                false,
                "active",
                23,
                "旧人设",
                List.of("温柔"),
                objectMapper.readTree("{}"),
                null,
                null,
                0,
                Instant.parse("2026-10-28T09:00:00Z"),
                Instant.parse("2026-10-28T10:00:00Z"),
                null);

        assertThat(objectMapper.writeValueAsString(view)).contains("\"expression\":null");
    }

    @Test
    void personaJsonRoundTrips() {
        PersonalityView personality = new PersonalityView("tsundere", List.of("soft-tsundere", "attentive"),
                "high", "low", "笨蛋", "name", "medium");
        FamilyView family = new FamilyView("county", "close", "tight", "家里有一只老狗");

        String json = CharacterPersona.toJson(objectMapper, 24, "在便利店上夜班", personality, family);
        JsonNode node = CharacterPersona.parse(objectMapper, json);

        assertThat(node.get("schemaVersion").asInt()).isEqualTo(2);
        assertThat(CharacterPersona.age(node, 23)).isEqualTo(24);
        assertThat(CharacterPersona.intro(node)).isEqualTo("在便利店上夜班");
        assertThat(CharacterPersona.personality(node)).isEqualTo(personality);
        assertThat(CharacterPersona.family(node)).isEqualTo(family);
        /* 旧 5 参重载写入默认 auto，保证老调用方拿到的 JSON 结构稳定。 */
        assertThat(CharacterPersona.expression(node).mode()).isEqualTo("auto");
        assertThat(CharacterPersona.expression(node).temperatureOverride()).isNull();
    }

    @Test
    void missingOrBrokenPersonaFallsBackToDefaults() {
        assertThat(CharacterPersona.parse(objectMapper, "{oops")).isNull();
        assertThat(CharacterPersona.personality(null)).isNull();
        assertThat(CharacterPersona.family(null)).isNull();
        assertThat(CharacterPersona.age(null, 23)).isEqualTo(23);
        assertThat(CharacterPersona.intro(null)).isEmpty();
        assertThat(CharacterPersona.expression(null).mode()).isEqualTo("auto");
        assertThat(CharacterPersona.expression(null).temperatureOverride()).isNull();
    }
}
