package com.shenyouchu.core.memorygraph.dto;

import java.time.Instant;
import java.util.List;

/** 记忆星图快照（API 与 snapshot payload 同构）。 */
public record MemoryGraphView(
        int version,
        String characterId,
        String characterName,
        Instant generatedAt,
        String mode,
        String layoutSeed,
        List<ConstellationView> constellations,
        List<GraphNodeView> nodes,
        List<GraphEdgeView> edges,
        GraphStatsView stats) {
}
