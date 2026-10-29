package com.shenyouchu.core.character;

import com.shenyouchu.core.character.dto.CharacterMutationResult;
import com.shenyouchu.core.character.dto.CharacterPurgeResult;
import com.shenyouchu.core.character.dto.CharacterView;
import com.shenyouchu.core.character.dto.CreateCharacterRequest;
import com.shenyouchu.core.character.dto.DuplicateCharacterRequest;
import com.shenyouchu.core.character.dto.PurgeCharacterRequest;
import com.shenyouchu.core.character.dto.UpdateCharacterRequest;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 角色中心接口（契约见 docs/07-character-customization.md §5.4）。
 *
 * <p>所有操作都从认证上下文取 userId；请求体只接收结构化字段，
 * 不接受 systemPrompt / personaPrompt / rawConfig 等自由提示词。
 */
@RestController
@RequestMapping("/api/v1/characters")
public class CharacterController {

    private final CharacterService characterService;

    public CharacterController(CharacterService characterService) {
        this.characterService = characterService;
    }

    /** 官方 + 当前用户自定义角色；默认不含归档（归档只作用于自定义角色）。 */
    @GetMapping
    public List<CharacterView> list(@RequestParam(defaultValue = "false") boolean includeArchived) {
        return characterService.list(CurrentUser.require().userId(), includeArchived);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CharacterView create(@RequestBody(required = false) CreateCharacterRequest request) {
        return characterService.create(CurrentUser.require().userId(), request);
    }

    /** 官方或本人所有；他人自定义角色返回 404。 */
    @GetMapping("/{id}")
    public CharacterView get(@PathVariable String id) {
        Long userId = CurrentUser.require().userId();
        return characterService.get(userId, characterService.parseCharacterId(id));
    }

    /** 更新自定义角色；官方 403 CHARACTER_READONLY，版本不一致 409 CHARACTER_VERSION_CONFLICT。 */
    @PatchMapping("/{id}")
    public CharacterView update(@PathVariable String id,
                                @RequestBody(required = false) UpdateCharacterRequest request) {
        Long userId = CurrentUser.require().userId();
        return characterService.update(userId, characterService.parseCharacterId(id), request);
    }

    /** 复制为我的角色：复制人设与形象，不复制本机立绘。 */
    @PostMapping("/{id}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public CharacterView duplicate(@PathVariable String id,
                                   @RequestBody(required = false) DuplicateCharacterRequest request) {
        Long userId = CurrentUser.require().userId();
        return characterService.duplicate(userId, characterService.parseCharacterId(id), request);
    }

    @PostMapping("/{id}/archive")
    public CharacterMutationResult archive(@PathVariable String id) {
        Long userId = CurrentUser.require().userId();
        return characterService.archive(userId, characterService.parseCharacterId(id));
    }

    @PostMapping("/{id}/restore")
    public CharacterMutationResult restore(@PathVariable String id) {
        Long userId = CurrentUser.require().userId();
        return characterService.restore(userId, characterService.parseCharacterId(id));
    }

    /** 彻底删除：confirmName 必须与角色名一致，级联清理会话/消息/记忆/状态。 */
    @PostMapping("/{id}/purge")
    public CharacterPurgeResult purge(@PathVariable String id,
                                      @RequestBody(required = false) PurgeCharacterRequest request) {
        Long userId = CurrentUser.require().userId();
        return characterService.purge(userId, characterService.parseCharacterId(id),
                request == null ? null : request.confirmName());
    }
}
