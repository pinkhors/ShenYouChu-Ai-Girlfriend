package com.shenyouchu.core.character.dto;

/** 性格设定（v2 人设结构，文档 §3.3 / §5.2）。 */
public record PersonalityView(
        String archetype,
        java.util.List<String> modifiers,
        String intensity,
        String initiative,
        String addressUser,
        String selfRef,
        String jealousy) {
}
