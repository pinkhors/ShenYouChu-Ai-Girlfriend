package com.shenyouchu.core.character;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.dto.ExpressionConfig;
import com.shenyouchu.core.character.dto.ExpressionView;
import com.shenyouchu.core.character.dto.PersonalityView;
import com.shenyouchu.core.expression.ExpressionScene;
import com.shenyouchu.core.expression.ExpressionTemperature;
import com.shenyouchu.core.expression.ExpressionTemperatureCalculator;
import com.shenyouchu.core.expression.ExpressionTemperatureResolver;
import org.springframework.stereotype.Service;

import java.util.Locale;

/**
 * 角色表达温度的集成层（文档 09 §6.2 / §7）。
 *
 * <p>把「角色人设 + 形象」交给纯逻辑包推导自动温度，再按 mode/override/场景解析出生效温度。
 * 官方角色（owner_user_id 为 NULL）没有表达配置：视图返回 {@code null}，温度返回
 * {@link Double#NaN}，由调用方回退到用户级 LLM 温度。
 */
@Service
public class CharacterExpressionService {

    private static final ExpressionTemperatureCalculator CALCULATOR = new ExpressionTemperatureCalculator();
    private static final ExpressionTemperatureResolver RESOLVER = new ExpressionTemperatureResolver();

    private final ObjectMapper objectMapper;

    public CharacterExpressionService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 角色视图中的表达温度快照；官方角色返回 null。 */
    public ExpressionView view(CharacterProfile character) {
        if (!isCustom(character)) {
            return null;
        }
        JsonNode persona = CharacterPersona.parse(objectMapper, character.getPersonaConfig());
        ExpressionConfig config = CharacterPersona.expression(persona);
        String mode = effectiveMode(config);
        Double override = override(config, mode);
        ExpressionTemperature auto = autoTemperature(persona, character);
        double effective = RESOLVER.effectiveTemperature(
                auto.autoTemperature(), mode, override, ExpressionScene.REPLY);
        return new ExpressionView(mode, override, auto.autoTemperature(), effective, mode,
                auto.explanation());
    }

    /** 自动回话使用的温度（REPLY 场景）；官方角色返回 NaN。 */
    public double replyTemperature(CharacterProfile character) {
        return temperature(character, ExpressionScene.REPLY);
    }

    /** 指定场景的生效温度；官方角色返回 NaN。 */
    public double temperature(CharacterProfile character, ExpressionScene scene) {
        if (!isCustom(character)) {
            return Double.NaN;
        }
        JsonNode persona = CharacterPersona.parse(objectMapper, character.getPersonaConfig());
        ExpressionConfig config = CharacterPersona.expression(persona);
        String mode = effectiveMode(config);
        Double override = override(config, mode);
        ExpressionTemperature auto = autoTemperature(persona, character);
        return RESOLVER.effectiveTemperature(auto.autoTemperature(), mode, override,
                scene == null ? ExpressionScene.REPLY : scene);
    }

    private static boolean isCustom(CharacterProfile character) {
        return character != null && character.getOwnerUserId() != null;
    }

    /** 持久化数据里的非法组合（manual 缺 override）按 auto 解释，避免读路径抛错。 */
    private static String effectiveMode(ExpressionConfig config) {
        String mode = config.mode() == null ? "" : config.mode().trim().toLowerCase(Locale.ROOT);
        if (ExpressionConfig.MODE_MANUAL.equals(mode) && config.temperatureOverride() != null) {
            return ExpressionConfig.MODE_MANUAL;
        }
        return ExpressionConfig.MODE_AUTO;
    }

    private static Double override(ExpressionConfig config, String mode) {
        return ExpressionConfig.MODE_MANUAL.equals(mode) ? config.temperatureOverride() : null;
    }

    private ExpressionTemperature autoTemperature(JsonNode persona, CharacterProfile character) {
        PersonalityView personality = CharacterPersona.personality(persona);
        return CALCULATOR.calculate(personality, avatar(character.getAvatarConfig()));
    }

    /** 形象 JSON 解析失败时按“无贡献”处理，不影响角色卡其余字段。 */
    private JsonNode avatar(String json) {
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
