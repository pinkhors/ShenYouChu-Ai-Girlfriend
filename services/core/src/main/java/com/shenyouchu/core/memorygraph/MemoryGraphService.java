package com.shenyouchu.core.memorygraph;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.memorygraph.dto.MemoryChunkDetailView;
import com.shenyouchu.core.memorygraph.dto.MemoryGraphView;
import com.shenyouchu.core.memorygraph.mapper.MemoryChunkMapper;
import com.shenyouchu.core.memorygraph.mapper.MemoryGraphSnapshotMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 星图读写：快照只读投影，删除/遗忘后立即重建。
 *
 * <p>快照按 (user_id, character_id) 唯一；版本号单调递增。重建失败不影响对话。
 */
@Service
public class MemoryGraphService {

    private static final Logger log = LoggerFactory.getLogger(MemoryGraphService.class);

    private final MemoryChunkMapper chunkMapper;
    private final MemoryGraphSnapshotMapper snapshotMapper;
    private final GraphProjector projector;
    private final CharacterMapper characterMapper;
    private final ObjectMapper objectMapper;
    private final int maxNodes;
    private final int maxGhosts;

    public MemoryGraphService(MemoryChunkMapper chunkMapper,
                              MemoryGraphSnapshotMapper snapshotMapper,
                              GraphProjector projector,
                              CharacterMapper characterMapper,
                              ObjectMapper objectMapper,
                              @Value("${shenyouchu.memory.graph.max-nodes:300}") int maxNodes,
                              @Value("${shenyouchu.memory.graph.max-ghosts:20}") int maxGhosts) {
        this.chunkMapper = chunkMapper;
        this.snapshotMapper = snapshotMapper;
        this.projector = projector;
        this.characterMapper = characterMapper;
        this.objectMapper = objectMapper;
        this.maxNodes = Math.max(maxNodes, 1);
        this.maxGhosts = Math.max(maxGhosts, 0);
    }

    /** 取快照；不存在或强制重建时现场构建。 */
    public MemoryGraphView get(Long userId, Long characterId, boolean rebuild) {
        if (!rebuild) {
            MemoryGraphSnapshot existing = findSnapshot(userId, characterId);
            if (existing != null) {
                MemoryGraphView cached = parse(existing.getPayloadJson());
                if (cached != null) {
                    return cached;
                }
            }
        }
        return rebuild(userId, characterId, "incremental");
    }

    public MemoryGraphView rebuild(Long userId, Long characterId, String mode) {
        MemoryGraphSnapshot existing = findSnapshot(userId, characterId);
        int version = existing == null || existing.getVersion() == null ? 1 : existing.getVersion() + 1;
        String characterName = characterName(characterId);

        List<MemoryChunk> chunks = new ArrayList<>(loadChunks(userId, characterId));
        MemoryGraphView view = projector.project(userId, characterId, characterName, chunks, version, mode);
        saveSnapshot(existing, userId, characterId, view);
        return view;
    }

    /** 对话入库后调用；失败只记日志，不影响本轮。 */
    public void refreshIncremental(Long userId, Long characterId) {
        try {
            rebuild(userId, characterId, "incremental");
        } catch (RuntimeException ex) {
            log.warn("星图增量刷新失败 user={} character={}: {}", userId, characterId, ex.getMessage());
        }
    }

    public MemoryChunkDetailView detail(Long userId, Long characterId, Long chunkId) {
        MemoryChunk chunk = chunkMapper.selectOne(Wrappers.<MemoryChunk>lambdaQuery()
                .eq(MemoryChunk::getId, chunkId)
                .eq(MemoryChunk::getUserId, userId)
                .eq(MemoryChunk::getCharacterId, characterId));
        if (chunk == null) {
            return null;
        }
        return new MemoryChunkDetailView(
                String.valueOf(chunk.getId()),
                String.valueOf(chunk.getCharacterId()),
                String.valueOf(chunk.getConversationId()),
                chunk.getUserMessageId() == null ? null : String.valueOf(chunk.getUserMessageId()),
                chunk.getAssistantMessageId() == null ? null : String.valueOf(chunk.getAssistantMessageId()),
                chunk.getChunkText(),
                chunk.getSummary(),
                MemorySignals.parseJsonList(chunk.getTopicsJson(), List.of()),
                MemorySignals.parseJsonList(chunk.getEntitiesJson(), List.of()),
                chunk.getCategory(),
                chunk.getCreatedAt(),
                chunk.getInvalidAt());
    }

    /** 遗忘：写 invalid_at，节点变幽灵；不物理删除。 */
    public boolean forget(Long userId, Long characterId, Long chunkId) {
        MemoryChunk chunk = chunkMapper.selectOne(Wrappers.<MemoryChunk>lambdaQuery()
                .eq(MemoryChunk::getId, chunkId)
                .eq(MemoryChunk::getUserId, userId)
                .eq(MemoryChunk::getCharacterId, characterId));
        if (chunk == null) {
            return false;
        }
        if (chunk.getInvalidAt() == null) {
            chunk.setInvalidAt(Instant.now());
            chunkMapper.updateById(chunk);
        }
        refreshIncremental(userId, characterId);
        return true;
    }

    private List<MemoryChunk> loadChunks(Long userId, Long characterId) {
        List<MemoryChunk> active = chunkMapper.selectList(Wrappers.<MemoryChunk>lambdaQuery()
                .eq(MemoryChunk::getUserId, userId)
                .eq(MemoryChunk::getCharacterId, characterId)
                .isNull(MemoryChunk::getInvalidAt)
                .orderByDesc(MemoryChunk::getCreatedAt)
                .last("LIMIT " + maxNodes));
        List<MemoryChunk> chunks = new ArrayList<>(active);
        if (maxGhosts > 0) {
            chunks.addAll(chunkMapper.selectList(Wrappers.<MemoryChunk>lambdaQuery()
                    .eq(MemoryChunk::getUserId, userId)
                    .eq(MemoryChunk::getCharacterId, characterId)
                    .isNotNull(MemoryChunk::getInvalidAt)
                    .orderByDesc(MemoryChunk::getCreatedAt)
                    .last("LIMIT " + maxGhosts)));
        }
        return chunks;
    }

    private MemoryGraphSnapshot findSnapshot(Long userId, Long characterId) {
        return snapshotMapper.selectOne(Wrappers.<MemoryGraphSnapshot>lambdaQuery()
                .eq(MemoryGraphSnapshot::getUserId, userId)
                .eq(MemoryGraphSnapshot::getCharacterId, characterId));
    }

    private void saveSnapshot(MemoryGraphSnapshot existing, Long userId, Long characterId, MemoryGraphView view) {
        String payload;
        try {
            payload = objectMapper.writeValueAsString(view);
        } catch (Exception ex) {
            throw new IllegalStateException("星图快照序列化失败", ex);
        }
        MemoryGraphSnapshot snapshot = existing == null ? new MemoryGraphSnapshot() : existing;
        snapshot.setUserId(userId);
        snapshot.setCharacterId(characterId);
        snapshot.setVersion(view.version());
        snapshot.setMode(view.mode());
        snapshot.setPayloadJson(payload);
        snapshot.setGeneratedAt(view.generatedAt());
        try {
            if (snapshot.getId() == null) {
                snapshotMapper.insert(snapshot);
            } else {
                snapshotMapper.updateById(snapshot);
            }
        } catch (DuplicateKeyException ex) {
            MemoryGraphSnapshot current = findSnapshot(userId, characterId);
            if (current == null) {
                throw ex;
            }
            current.setVersion(view.version());
            current.setMode(view.mode());
            current.setPayloadJson(payload);
            current.setGeneratedAt(view.generatedAt());
            snapshotMapper.updateById(current);
        }
    }

    private MemoryGraphView parse(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(payload, MemoryGraphView.class);
        } catch (Exception ex) {
            log.warn("星图快照反序列化失败，将重建：{}", ex.getMessage());
            return null;
        }
    }

    private String characterName(Long characterId) {
        CharacterProfile character = characterId == null ? null : characterMapper.selectById(characterId);
        return character == null ? "她" : character.getDisplayName();
    }
}
