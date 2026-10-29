package com.shenyouchu.core.character.dto;

/** 家庭背景设定（v2 人设结构，文档 §3.4 / §5.2）。 */
public record FamilyView(
        String growth,
        String relations,
        String economy,
        String extraNote) {
}
