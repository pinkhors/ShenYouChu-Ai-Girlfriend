package com.shenyouchu.core.character;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/characters")
public class CharacterController {

    private final CharacterMapper characterMapper;

    public CharacterController(CharacterMapper characterMapper) {
        this.characterMapper = characterMapper;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return characterMapper.selectList(Wrappers.<CharacterProfile>lambdaQuery()
                        .eq(CharacterProfile::getPublicVisible, true)
                        .orderByAsc(CharacterProfile::getDisplayName))
                .stream()
                .map(character -> Map.<String, Object>of(
                        "id", character.getId(),
                        "code", character.getCode(),
                        "displayName", character.getDisplayName(),
                        "personaVersion", character.getPersonaVersion()))
                .toList();
    }
}
