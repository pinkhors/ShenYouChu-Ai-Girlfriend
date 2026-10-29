package com.shenyouchu.core.character.dto;

/** 彻底删除确认：必须与角色名完全一致，避免误删。 */
public record PurgeCharacterRequest(String confirmName) {
}
