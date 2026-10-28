package com.shenyouchu.core.relationship;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.relationship.dto.CharacterStateView;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/character-state")
public class CharacterStateController {

    private static final String DEFAULT_CHARACTER_CODE = "shenyouchu";

    private final RelationshipService relationshipService;
    private final CharacterMapper characterMapper;

    public CharacterStateController(RelationshipService relationshipService, CharacterMapper characterMapper) {
        this.relationshipService = relationshipService;
        this.characterMapper = characterMapper;
    }

    /** 当前用户与默认角色的关系状态；无记录时返回初始值（心情 50、亲密度 0）。 */
    @GetMapping
    public CharacterStateView current() {
        CharacterProfile character = characterMapper.selectOne(Wrappers.<CharacterProfile>lambdaQuery()
                .eq(CharacterProfile::getCode, DEFAULT_CHARACTER_CODE));
        if (character == null) {
            throw ApiException.notFound("默认角色未初始化，请先执行数据库迁移");
        }
        return relationshipService.view(CurrentUser.require().userId(), character.getId());
    }
}
