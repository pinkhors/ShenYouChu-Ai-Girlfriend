package com.shenyouchu.core.relationship;

import com.shenyouchu.core.character.CharacterService;
import com.shenyouchu.core.relationship.dto.CharacterStateView;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/character-state")
public class CharacterStateController {

    private final RelationshipService relationshipService;
    private final CharacterService characterService;

    public CharacterStateController(RelationshipService relationshipService, CharacterService characterService) {
        this.relationshipService = relationshipService;
        this.characterService = characterService;
    }

    /**
     * 当前用户与某个角色的关系状态；不传 characterId 时使用当前角色。
     * 只接受官方或本人所有的角色，否则 404，避免通过状态接口探测他人角色。
     */
    @GetMapping
    public CharacterStateView current(@RequestParam(required = false) String characterId) {
        Long userId = CurrentUser.require().userId();
        Long resolved = characterService.resolveVisibleCharacterId(userId, characterId);
        return relationshipService.view(userId, resolved);
    }
}
