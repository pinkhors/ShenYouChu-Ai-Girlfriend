package com.shenyouchu.core.relationship;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.relationship.dto.CharacterStateView;
import com.shenyouchu.core.relationship.mapper.UserCharacterStateMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 关系状态：每个用户与角色一条记录，基于对话内容做有界更新。
 * 规则是确定性的（见 {@link RelationshipRules}）；接入情感模型后只替换规则来源，接口不变。
 */
@Service
public class RelationshipService {

    private final UserCharacterStateMapper stateMapper;

    public RelationshipService(UserCharacterStateMapper stateMapper) {
        this.stateMapper = stateMapper;
    }

    @Transactional
    public UserCharacterState getOrCreate(Long userId, Long characterId) {
        UserCharacterState state = stateMapper.selectOne(Wrappers.<UserCharacterState>lambdaQuery()
                .eq(UserCharacterState::getUserId, userId)
                .eq(UserCharacterState::getCharacterId, characterId));
        if (state != null) {
            return state;
        }
        UserCharacterState created = new UserCharacterState(userId, characterId);
        stateMapper.insert(created);
        return created;
    }

    /** 每轮仅调用一次：心情按内容增减，亲密度随有效互动 +1，均有上限。 */
    @Transactional
    public CharacterStateView applyTurn(Long userId, Long characterId, String userText) {
        UserCharacterState state = getOrCreate(userId, characterId);
        state.setMood(RelationshipRules.clampMood(state.getMood() + RelationshipRules.moodDelta(userText)));
        state.setIntimacy(RelationshipRules.clampIntimacy(state.getIntimacy() + 1));
        stateMapper.updateById(state);
        return RelationshipRules.toView(state);
    }

    @Transactional(readOnly = true)
    public CharacterStateView view(Long userId, Long characterId) {
        UserCharacterState state = stateMapper.selectOne(Wrappers.<UserCharacterState>lambdaQuery()
                .eq(UserCharacterState::getUserId, userId)
                .eq(UserCharacterState::getCharacterId, characterId));
        if (state == null) {
            return new CharacterStateView(String.valueOf(characterId), 50, 0, 0L);
        }
        return RelationshipRules.toView(state);
    }
}
