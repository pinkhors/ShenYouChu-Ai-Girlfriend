package com.shenyouchu.core.memorygraph.backfill;

import com.shenyouchu.core.character.CharacterService;
import com.shenyouchu.core.memorygraph.backfill.MemoryBackfillService.BackfillResult;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 历史消息回填记忆 chunk（文档 08 §21）。
 *
 * <p>角色解析与越权处理复用 {@link CharacterService#resolveVisibleCharacterId}：
 * 不传 characterId 用当前角色，非官方且非本人角色统一 404。
 */
@RestController
@RequestMapping("/api/v1/memory-graph")
public class MemoryBackfillController {

    private final MemoryBackfillService backfillService;
    private final CharacterService characterService;

    public MemoryBackfillController(MemoryBackfillService backfillService,
                                    CharacterService characterService) {
        this.backfillService = backfillService;
        this.characterService = characterService;
    }

    @PostMapping("/backfill")
    public BackfillResult backfill(@RequestParam(required = false) String characterId,
                                   @RequestParam(required = false) Integer limit) {
        Long userId = CurrentUser.require().userId();
        Long resolved = characterService.resolveVisibleCharacterId(userId, characterId);
        return backfillService.backfill(userId, resolved, limit);
    }
}
