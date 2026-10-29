package com.shenyouchu.core.memory;

import com.shenyouchu.core.character.CharacterService;
import com.shenyouchu.core.memory.dto.MemoryView;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/memories")
public class MemoryController {

    private final MemoryService memoryService;
    private final CharacterService characterService;

    public MemoryController(MemoryService memoryService, CharacterService characterService) {
        this.memoryService = memoryService;
        this.characterService = characterService;
    }

    /** characterId 可选：按角色筛选记忆（P1）；归属校验与状态查询一致，非官方/本人返回 404。 */
    @GetMapping
    public List<MemoryView> list(@RequestParam(required = false) String characterId) {
        Long userId = CurrentUser.require().userId();
        Long filter = characterId == null || characterId.isBlank()
                ? null
                : characterService.resolveVisibleCharacterId(userId, characterId);
        return memoryService.list(userId, filter);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        memoryService.delete(CurrentUser.require().userId(), id);
    }
}