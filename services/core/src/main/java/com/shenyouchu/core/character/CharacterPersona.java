package com.shenyouchu.core.character;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 自定义角色 v2 人设 JSON（文档 §5.2）的编解码。
 *
 * <p>只保存结构化字段，不保存提示词；官方角色继续使用 V2 之前的 v1 结构，不会写入这里。
 */
public final class CharacterPersona {

    public static final int SCHEMA_VERSION = 2;

    private CharacterPersona() {
    }

    /** 生成 v2 人设 JSON。 */
    public static String toJson(ObjectMapper objectMapper, int age, String intro,
                                PersonalityView personality, FamilyView family) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schemaVersion", SCHEMA_VERSION);
        root.put("age", age);
        root.put("intro", intro == null ? "" : intro);
        root.put("personality", personality);
        root.put("family", family);
        try {
            return objectMapper.writeValueAsString(root);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("角色人设序列化失败", ex);
        }
    }

    public static JsonNode parse(ObjectMapper objectMapper, String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }

    public static int age(JsonNode persona, int fallback) {
        if (persona == null || !persona.isObject()) {
            return fallback;
        }
        JsonNode age = persona.get("age");
        return age != null && age.canConvertToInt() ? age.asInt() : fallback;
    }

    public static String intro(JsonNode persona) {
        if (persona == null || !persona.isObject()) {
            return "";
        }
        JsonNode intro = persona.get("intro");
        return intro != null && intro.isTextual() ? intro.asText() : "";
    }

    public static PersonalityView personality(JsonNode persona) {
        if (persona == null || !persona.isObject()) {
            return null;
        }
        return personalityNode(persona.get("personality"));
    }

    public static FamilyView family(JsonNode persona) {
        if (persona == null || !persona.isObject()) {
            return null;
        }
        return familyNode(persona.get("family"));
    }

    public static PersonalityView personalityNode(JsonNode node) {
        if (node == null || !node.isObject()) {
            return null;
        }
        return new PersonalityView(
                text(node, "archetype"),
                stringList(node.get("modifiers")),
                text(node, "intensity"),
                text(node, "initiative"),
                text(node, "addressUser"),
                text(node, "selfRef"),
                text(node, "jealousy"));
    }

    public static FamilyView familyNode(JsonNode node) {
        if (node == null || !node.isObject()) {
            return null;
        }
        return new FamilyView(
                text(node, "growth"),
                text(node, "relations"),
                text(node, "economy"),
                text(node, "extraNote"));
    }

    private static List<String> stringList(JsonNode node) {
        List<String> values = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(item -> {
                if (item.isTextual()) {
                    values.add(item.asText());
                }
            });
        }
        return List.copyOf(values);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isTextual() ? value.asText() : null;
    }
}
