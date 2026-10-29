package com.shenyouchu.core.character;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.dto.ExpressionConfig;
import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;
import com.shenyouchu.core.common.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 纯逻辑测试：角色设定校验（名称/年龄/长度/互斥/枚举）。 */
class CharacterValidatorTest {

    private final CharacterValidator validator = new CharacterValidator();

    private static PersonalityView personality(String archetype, List<String> modifiers) {
        return new PersonalityView(archetype, modifiers, "medium", "medium", "你", "我", "medium");
    }

    @Test
    void nameIsTrimmedAndLengthChecked() {
        assertThat(validator.normalizeName("  林晚  ")).isEqualTo("林晚");
        assertThatThrownBy(() -> validator.normalizeName("林"))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("CHARACTER_NAME_INVALID");
        assertThatThrownBy(() -> validator.normalizeName("一二三四五六七八九十一二三"))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> validator.normalizeName("林\n晚"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("换行");
    }

    @Test
    void ageMustBeAdultAndInRange() {
        assertThat(validator.normalizeAge(null)).isEqualTo(23);
        assertThat(validator.normalizeAge(18)).isEqualTo(18);
        assertThat(validator.normalizeAge(45)).isEqualTo(45);
        assertThatThrownBy(() -> validator.normalizeAge(17))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("CHARACTER_AGE_OUT_OF_RANGE");
        assertThatThrownBy(() -> validator.normalizeAge(46))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void introAndExtraNoteLengthAreLimited() {
        assertThat(validator.normalizeIntro(null)).isEmpty();
        assertThat(validator.normalizeIntro("短介绍")).isEqualTo("短介绍");
        assertThatThrownBy(() -> validator.normalizeIntro("字".repeat(41)))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("CHARACTER_NOTE_TOO_LONG");
        assertThatThrownBy(() -> validator.normalizeExtraNote("字".repeat(61)))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("CHARACTER_NOTE_TOO_LONG");
        assertThatThrownBy(() -> validator.normalizeExtraNote("怕打雷\n还有别的"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("不能换行");
    }

    @Test
    void modifiersAreLimitedAndMutuallyExclusive() {
        assertThatThrownBy(() -> validator.normalizePersonality(
                personality("gentle", List.of("attentive", "romantic", "teasing"))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("最多选择 2 个");
        assertThatThrownBy(() -> validator.normalizePersonality(
                personality("gentle", List.of("independent", "clingy"))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("不能同时选择");
        assertThatThrownBy(() -> validator.normalizePersonality(
                personality("gentle", List.of("unknown"))))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void archetypeAndLevelsMustBeWhitelisted() {
        assertThatThrownBy(() -> validator.normalizePersonality(personality("yandere", List.of())))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("主性格");
        assertThatThrownBy(() -> validator.normalizePersonality(new PersonalityView(
                "gentle", List.of(), "extreme", "medium", "你", "我", "medium")))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> validator.normalizePersonality(new PersonalityView(
                "gentle", List.of(), "medium", "medium", "你", "朕", "medium")))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> validator.normalizePersonality(new PersonalityView(
                "gentle", List.of(), "medium", "medium", "一二三四五六七", "我", "medium")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void personalityDefaultsAreFilled() {
        PersonalityView normalized = validator.normalizePersonality(null);
        assertThat(normalized.archetype()).isEqualTo("gentle");
        assertThat(normalized.intensity()).isEqualTo("medium");
        assertThat(normalized.addressUser()).isEqualTo("你");
        assertThat(normalized.selfRef()).isEqualTo("我");
        assertThat(normalized.modifiers()).isEmpty();
    }

    @Test
    void familyEnumsMustBeWhitelisted() {
        FamilyView normalized = validator.normalizeFamily(null);
        assertThat(normalized.growth()).isEqualTo("city");
        assertThat(normalized.relations()).isEqualTo("polite");
        assertThat(normalized.economy()).isEqualTo("ordinary");

        assertThatThrownBy(() -> validator.normalizeFamily(
                new FamilyView("moon", "polite", "ordinary", "")))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> validator.normalizeFamily(
                new FamilyView("city", "polite", "unknown", "")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void avatarConfigMustBeObjectWithinSizeAndWhitelistedStyle() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        assertThat(validator.normalizeAvatarConfig(null))
                .contains("\"outfitStyle\":\"casual\"")
                .contains("\"accessory\":\"none\"");

        assertThatThrownBy(() -> validator.normalizeAvatarConfig(mapper.readTree("[1,2]")))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("JSON 对象");
        assertThatThrownBy(() -> validator.normalizeAvatarConfig(
                mapper.readTree("{\"skinTone\":\"natural\",\"outfitStyle\":\"gothic\"}")))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("服饰风格");

        String huge = "{\"skinTone\":\"" + "x".repeat(8 * 1024) + "\"}";
        assertThatThrownBy(() -> validator.normalizeAvatarConfig(mapper.readTree(huge)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("8KB");

        assertThatCode(() -> validator.normalizeAvatarConfig(
                mapper.readTree("{\"skinTone\":\"natural\",\"outfitStyle\":\"knit\"}")))
                .doesNotThrowAnyException();
    }

    @Test
    void purgeConfirmNameMustMatch() {
        assertThatThrownBy(() -> validator.requireConfirmName("林晚", "苏念"))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("CHARACTER_CONFIRM_MISMATCH");
        assertThatCode(() -> validator.requireConfirmName("林晚", " 林晚 "))
                .doesNotThrowAnyException();
    }

    @Test
    void expressionConfigIsNormalized() {
        assertThat(validator.normalizeExpression(null)).isEqualTo(ExpressionConfig.auto());
        assertThat(validator.normalizeExpression(new ExpressionConfig(null, null)))
                .isEqualTo(ExpressionConfig.auto());
        /* auto 时忽略并清空 override */
        assertThat(validator.normalizeExpression(new ExpressionConfig("auto", 0.9)))
                .isEqualTo(new ExpressionConfig("auto", null));
        /* 数值四舍五入到 2 位；mode 大小写归一 */
        assertThat(validator.normalizeExpression(new ExpressionConfig("MANUAL", 0.923)))
                .isEqualTo(new ExpressionConfig("manual", 0.92));
        assertThat(validator.normalizeExpression(new ExpressionConfig(" manual ", 0.30)))
                .isEqualTo(new ExpressionConfig("manual", 0.30));
        assertThat(validator.normalizeExpression(new ExpressionConfig("manual", 1.20)))
                .isEqualTo(new ExpressionConfig("manual", 1.20));
    }

    @Test
    void invalidExpressionConfigReturnsStableCode() {
        assertExpressionInvalid(new ExpressionConfig("boost", null));
        assertExpressionInvalid(new ExpressionConfig("manual", null));
        assertExpressionInvalid(new ExpressionConfig("manual", 0.29));
        assertExpressionInvalid(new ExpressionConfig("manual", 1.21));
        assertExpressionInvalid(new ExpressionConfig("manual", Double.NaN));
        assertExpressionInvalid(new ExpressionConfig("manual", Double.POSITIVE_INFINITY));
    }

    private void assertExpressionInvalid(ExpressionConfig config) {
        assertThatThrownBy(() -> validator.normalizeExpression(config))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    ApiException api = (ApiException) ex;
                    assertThat(api.getCode()).isEqualTo("CHARACTER_EXPRESSION_INVALID");
                    assertThat(api.getStatus().value()).isEqualTo(400);
                });
    }
}
