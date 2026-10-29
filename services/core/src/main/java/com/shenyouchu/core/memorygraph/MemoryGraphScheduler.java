package com.shenyouchu.core.memorygraph;

import com.shenyouchu.core.memorygraph.mapper.MemoryChunkMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 夜间一致性校准：对所有存在 chunk 的角色重建快照。
 *
 * <p>本期单实例；多实例部署时需在 P2 增加分布式锁，否则会重复重建（有唯一键兜底，不会写坏数据）。
 */
@Component
public class MemoryGraphScheduler {

    private static final Logger log = LoggerFactory.getLogger(MemoryGraphScheduler.class);

    private final MemoryChunkMapper chunkMapper;
    private final MemoryGraphService graphService;

    public MemoryGraphScheduler(MemoryChunkMapper chunkMapper, MemoryGraphService graphService) {
        this.chunkMapper = chunkMapper;
        this.graphService = graphService;
    }

    @Scheduled(cron = "${shenyouchu.memory.graph.nightly-cron:0 30 3 * * *}")
    public void nightly() {
        List<MemoryChunk> owners = chunkMapper.selectOwners();
        Set<String> seen = new LinkedHashSet<>();
        int rebuilt = 0;
        for (MemoryChunk owner : owners) {
            String key = owner.getUserId() + ":" + owner.getCharacterId();
            if (!seen.add(key)) {
                continue;
            }
            try {
                graphService.rebuild(owner.getUserId(), owner.getCharacterId(), "nightly");
                rebuilt++;
            } catch (RuntimeException ex) {
                log.warn("夜间星图校准失败 user={} character={}: {}",
                        owner.getUserId(), owner.getCharacterId(), ex.getMessage());
            }
        }
        if (rebuilt > 0) {
            log.info("夜间星图校准完成：{} 个角色", rebuilt);
        }
    }
}
