package com.shenyouchu.core.character;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.dto.ExpressionConfig;
import com.shenyouchu.core.character.dto.ExpressionView;
import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;
import com.shenyouchu.core.expression.ExpressionScene;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 纯逻辑测试：角色视图温度、生效温度与场景偏移（文档 09 §6.2 / §7）。 */
class CharacterExpressionServiceTest {

    private static final long USER_ID = 1L;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final CharacterExpressionService service = new CharacterExpressionService(objectMapper);

    private static final PersonalityView PERSONALITY =
            new PersonalityView("gentle", List.of("soft-tsundere"), "medium", "medium", "你", "我", "medium");
    private static final FamilyView FAMILY = new FamilyView("city", "polite", "ordinary", "");

    private CharacterProfile custom(ExpressionConfig expression) {
        CharacterProfile profile = new CharacterProfile();
        profile.setOwnerUserId(USER_ID);
        profile.setPersonaConfig(CharacterPersona.toJson(objectMapper, 23, "介绍", PERSONALITY, FAMILY,
                expression));
        profile.setAvatarConfig("{\"hairStyle\":\"long-straight\",\"outfitStyle\":\"casual\","
                + "\"outfitColor\":\"cream\"}");
        return profile;
    }

    @Test
    void officialCharacterHasNoExpressionAndNoTemperature() {
        CharacterProfile official = new CharacterProfile();
        official.setOwnerUserId(null);
        official.setPersonaConfig("{\"age\":23,\"traits\":[\"温柔\"]}");

        assertThat(service.view(official)).isNull();
        assertThat(service.replyTemperature(official)).isNaN();
        assertThat(service.temperature(official, ExpressionScene.PROACTIVE_SHARE)).isNaN();
        assertThat(service.view(null)).isNull();
        assertThat(service.replyTemperature(null)).isNaN();
    }

    @Test
    void autoTemperatureFollowsPersonalityAndAvatar() {
        ExpressionView view = service.view(custom(ExpressionConfig.auto()));

        assertThat(view).isNotNull();
        assertThat(view.mode()).isEqualTo("auto");
        assertThat(view.temperatureOverride()).isNull();
        assertThat(view.autoTemperature()).isEqualTo(0.74);
        assertThat(view.effectiveTemperature()).isEqualTo(0.74);
        assertThat(view.source()).isEqualTo("auto");
        /* 解释顺序固定：基础 → 主性格 → 调味 → 表达 → 形象 → 夹取 */
        assertThat(view.explanation()).hasSize(6);
        assertThat(view.explanation().get(0)).isEqualTo("基础 0.78");
        assertThat(view.explanation().get(1)).startsWith("主性格 温柔治愈");
        assertThat(view.explanation().get(2)).startsWith("调味 小傲娇");
        assertThat(view.explanation().get(3)).startsWith("表达 自然");
        assertThat(view.explanation().get(4)).startsWith("形象 长直发、奶油白");
        assertThat(view.explanation().get(5)).isEqualTo("夹取后 0.74");
    }

    @Test
    void manualOverrideWinsOverAutoValue() {
        ExpressionView view = service.view(custom(new ExpressionConfig("manual", 0.92)));

        assertThat(view.mode()).isEqualTo("manual");
        assertThat(view.temperatureOverride()).isEqualTo(0.92);
        assertThat(view.autoTemperature()).isEqualTo(0.74);
        assertThat(view.effectiveTemperature()).isEqualTo(0.92);
        assertThat(view.source()).isEqualTo("manual");
        assertThat(service.replyTemperature(custom(new ExpressionConfig("manual", 0.92)))).isEqualTo(0.92);
    }

    @Test
    void scenesApplyOffsetsAndClamp() {
        CharacterProfile auto = custom(ExpressionConfig.auto());

        assertThat(service.replyTemperature(auto)).isEqualTo(0.74);
        assertThat(service.temperature(auto, ExpressionScene.PROACTIVE_SHARE)).isEqualTo(0.79);
        assertThat(service.temperature(auto, ExpressionScene.PROACTIVE_FOLLOW_UP)).isEqualTo(0.71);
        assertThat(service.temperature(auto, ExpressionScene.PROACTIVE_REMINDER)).isEqualTo(0.68);
        assertThat(service.temperature(auto, null)).isEqualTo(0.74);

        CharacterProfile high = custom(new ExpressionConfig("manual", 1.20));
        assertThat(service.temperature(high, ExpressionScene.PROACTIVE_SHARE)).isEqualTo(1.20);
        CharacterProfile low = custom(new ExpressionConfig("manual", 0.30));
        assertThat(service.temperature(low, ExpressionScene.PROACTIVE_REMINDER)).isEqualTo(0.30);
    }

    @Test
    void legacyCustomPersonaWithoutExpressionFallsBackToAuto() {
        CharacterProfile legacy = new CharacterProfile();
        legacy.setOwnerUserId(USER_ID);
        legacy.setPersonaConfig("{\"schemaVersion\":2}");
        legacy.setAvatarConfig(null);

        ExpressionView view = service.view(legacy);

        assertThat(view.mode()).isEqualTo("auto");
        assertThat(view.autoTemperature()).isEqualTo(0.78);
        assertThat(view.source()).isEqualTo("auto");
    }

    @Test
    void brokenManualConfigIsReadAsAuto() {
        CharacterProfile broken = new CharacterProfile();
        broken.setOwnerUserId(USER_ID);
        broken.setPersonaConfig("{\"schemaVersion\":2,\"expression\":{\"mode\":\"manual\"}}");

        ExpressionView view = service.view(broken);

        assertThat(view.mode()).isEqualTo("auto");
        assertThat(view.temperatureOverride()).isNull();
        assertThat(view.effectiveTemperature()).isEqualTo(view.autoTemperature());
    }

    @Test
    void avatarContributesOnlyWeakVisualSignals() throws Exception {
        JsonNode avatar = objectMapper.readTree(
                "{\"skinTone\":\"fair\",\"faceShape\":0.9,\"hairStyle\":\"twin-tails\","
                        + "\"outfitStyle\":\"sporty\",\"outfitColor\":\"blush\"}");
        CharacterProfile profile = new CharacterProfile();
        profile.setOwnerUserId(USER_ID);
        profile.setPersonaConfig(CharacterPersona.toJson(objectMapper, 23, "介绍",
                new PersonalityView("lively", List.of(), "high", "medium", "你", "我", "medium"),
                FAMILY, ExpressionConfig.auto()));
        profile.setAvatarConfig(avatar.toString());

        /* 0.78 + 0.12 + 0 + 0.08 + clamp(0.03+0.03+0.02, -0.05, 0.05) = 1.03 → 自动上限 0.95 */
        assertThat(service.view(profile).autoTemperature()).isEqualTo(0.95);
    }
}
