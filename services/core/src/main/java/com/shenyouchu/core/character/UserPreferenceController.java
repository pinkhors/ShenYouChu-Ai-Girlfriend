package com.shenyouchu.core.character;

import com.shenyouchu.core.character.dto.ActiveCharacterRequest;
import com.shenyouchu.core.character.dto.ActiveCharacterResponse;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 当前角色偏好：与角色 CRUD 分开，便于前端在任意页面直接切换。 */
@RestController
@RequestMapping("/api/v1/preferences")
public class UserPreferenceController {

    private final CharacterService characterService;

    public UserPreferenceController(CharacterService characterService) {
        this.characterService = characterService;
    }

    @PutMapping("/active-character")
    public ActiveCharacterResponse setActive(@RequestBody ActiveCharacterRequest request) {
        String activeCharacterId = characterService.setActiveCharacter(
                CurrentUser.require().userId(),
                request == null ? null : request.characterId());
        return new ActiveCharacterResponse(activeCharacterId);
    }
}
