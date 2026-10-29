package com.shenyouchu.core.character.dto;

/** 归档/恢复结果：返回最新角色状态与回退后的当前角色。 */
public record CharacterMutationResult(CharacterView character, String activeCharacterId) {
}
