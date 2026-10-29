package com.shenyouchu.core.memorygraph;

import com.shenyouchu.core.character.CharacterService;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.memorygraph.dto.MemoryChunkDetailView;
import com.shenyouchu.core.memorygraph.dto.MemoryGraphView;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 记忆星图接口：快照读取/重建、记忆详情、遗忘。
 *
 * <p>所有查询按 user_id + character_id 隔离；越权统一 404，不泄露存在性。
 */
@RestController
@RequestMapping("/api/v1/memory-graph")
public class MemoryGraphController {

    private final MemoryGraphService graphService;
    private final CharacterService characterService;

    public MemoryGraphController(MemoryGraphService graphService, CharacterService characterService) {
        this.graphService = graphService;
        this.characterService = characterService;
    }

    @GetMapping
    public MemoryGraphView snapshot(@RequestParam(required = false) String characterId) {
        Long userId = CurrentUser.require().userId();
        Long resolved = characterService.resolveVisibleCharacterId(userId, characterId);
        return graphService.get(userId, resolved, false);
    }

    @PostMapping("/rebuild")
    public MemoryGraphView rebuild(@RequestParam(required = false) String characterId) {
        Long userId = CurrentUser.require().userId();
        Long resolved = characterService.resolveVisibleCharacterId(userId, characterId);
        return graphService.rebuild(userId, resolved, "nightly");
    }

    @GetMapping("/chunks/{chunkId}")
    public MemoryChunkDetailView detail(@PathVariable Long chunkId,
                                        @RequestParam(required = false) String characterId) {
        Long userId = CurrentUser.require().userId();
        Long resolved = characterService.resolveVisibleCharacterId(userId, characterId);
        MemoryChunkDetailView detail = graphService.detail(userId, resolved, chunkId);
        if (detail == null) {
            throw ApiException.notFound("MEMORY_NOT_FOUND", "记忆不存在");
        }
        return detail;
    }

    @PostMapping("/chunks/{chunkId}/forget")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void forget(@PathVariable Long chunkId,
                       @RequestParam(required = false) String characterId) {
        Long userId = CurrentUser.require().userId();
        Long resolved = characterService.resolveVisibleCharacterId(userId, characterId);
        if (!graphService.forget(userId, resolved, chunkId)) {
            throw ApiException.notFound("MEMORY_NOT_FOUND", "记忆不存在");
        }
    }
}
