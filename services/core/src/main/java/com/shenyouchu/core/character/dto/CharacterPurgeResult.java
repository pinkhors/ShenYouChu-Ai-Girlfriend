package com.shenyouchu.core.character.dto;

/**
 * 彻底删除结果：返回级联清理的计数与回退后的当前角色。
 */
public record CharacterPurgeResult(
        String activeCharacterId,
        int conversations,
        int messages,
        int memories,
        int states) {
}
