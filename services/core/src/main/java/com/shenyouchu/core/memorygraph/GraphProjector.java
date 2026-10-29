package com.shenyouchu.core.memorygraph;

import com.shenyouchu.core.memorygraph.dto.ConstellationView;
import com.shenyouchu.core.memorygraph.dto.GraphEdgeView;
import com.shenyouchu.core.memorygraph.dto.GraphNodeView;
import com.shenyouchu.core.memorygraph.dto.GraphStatsView;
import com.shenyouchu.core.memorygraph.dto.MemoryGraphView;
import com.shenyouchu.core.memorygraph.embedding.EmbeddingService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 记忆星图投影器：纯粹的读模型，不调 LLM、不写向量、不改真相源。
 *
 * <p>布局是确定性的：角度由分类基角 + id 哈希偏移决定，半径由重要度决定；
 * 不跑力导向，保证用户每次打开看到的空间关系一致。
 */
@Component
public class GraphProjector {

    public static final String CATEGORY_FACT = MemorySignals.CATEGORY_FACT;
    public static final String CATEGORY_PROMISE = MemorySignals.CATEGORY_PROMISE;
    public static final String CATEGORY_EPISODE = MemorySignals.CATEGORY_EPISODE;
    public static final String CATEGORY_HABIT = MemorySignals.CATEGORY_HABIT;

    private static final Map<String, String> LABELS = Map.of(
            CATEGORY_FACT, "关于你",
            CATEGORY_PROMISE, "你们的约定",
            CATEGORY_EPISODE, "一起经历",
            CATEGORY_HABIT, "她学到的");

    private static final Map<String, Double> BASE_ANGLES = Map.of(
            CATEGORY_FACT, -90.0,
            CATEGORY_PROMISE, 0.0,
            CATEGORY_EPISODE, 90.0,
            CATEGORY_HABIT, 180.0);

    private static final List<String> CATEGORY_ORDER = List.of(
            CATEGORY_FACT, CATEGORY_PROMISE, CATEGORY_EPISODE, CATEGORY_HABIT);

    private final EmbeddingService embeddingService;
    private final double semanticThreshold;
    private final int maxDegree;

    public GraphProjector(EmbeddingService embeddingService,
                          @Value("${shenyouchu.memory.graph.semantic-threshold:0.35}") double semanticThreshold,
                          @Value("${shenyouchu.memory.graph.max-degree:5}") int maxDegree) {
        this.embeddingService = embeddingService;
        this.semanticThreshold = semanticThreshold;
        this.maxDegree = Math.max(maxDegree, 1);
    }

    public MemoryGraphView project(Long userId, Long characterId, String characterName,
                                   List<MemoryChunk> chunks, int version, String mode) {
        List<MemoryChunk> ordered = chunks.stream()
                .sorted(Comparator.comparing(MemoryChunk::getId))
                .toList();

        List<GraphNodeView> nodes = new ArrayList<>(ordered.size());
        Map<String, Integer> counts = new LinkedHashMap<>();
        CATEGORY_ORDER.forEach(category -> counts.put(category, 0));
        int ghosts = 0;

        for (MemoryChunk chunk : ordered) {
            String category = normalizeCategory(chunk.getCategory());
            boolean ghost = chunk.getInvalidAt() != null;
            if (ghost) {
                ghosts++;
            } else {
                counts.merge(category, 1, Integer::sum);
            }
            double importance = importanceOf(chunk);
            nodes.add(new GraphNodeView(
                    "chunk:" + chunk.getId(),
                    String.valueOf(chunk.getId()),
                    chunk.getSummary() == null ? "一条记忆" : chunk.getSummary(),
                    category,
                    angleOf(category, chunk.getId()),
                    ghost ? 330.0 : 220.0 + (1.0 - importance) * 70.0,
                    round(importance),
                    ghost,
                    chunk.getCreatedAt(),
                    chunk.getConversationId() == null ? null : String.valueOf(chunk.getConversationId())));
        }

        List<ConstellationView> constellations = CATEGORY_ORDER.stream()
                .map(category -> new ConstellationView(
                        "cat:" + category,
                        LABELS.get(category),
                        category,
                        counts.getOrDefault(category, 0),
                        BASE_ANGLES.get(category),
                        150.0))
                .toList();

        List<GraphEdgeView> edges = new ArrayList<>();
        for (MemoryChunk chunk : ordered) {
            edges.add(new GraphEdgeView(
                    "own:" + chunk.getId(),
                    "cat:" + normalizeCategory(chunk.getCategory()),
                    "chunk:" + chunk.getId(),
                    "ownership",
                    1.0));
        }

        List<MemoryChunk> active = ordered.stream()
                .filter(chunk -> chunk.getInvalidAt() == null)
                .toList();
        edges.addAll(semanticEdges(active));
        edges.addAll(temporalEdges(active));

        return new MemoryGraphView(
                version,
                String.valueOf(characterId),
                characterName,
                Instant.now(),
                mode,
                layoutSeed(userId, characterId),
                constellations,
                nodes,
                edges,
                new GraphStatsView(active.size(), ghosts, edges.size()));
    }

    private List<GraphEdgeView> semanticEdges(List<MemoryChunk> chunks) {
        if (chunks.size() < 2) {
            return List.of();
        }
        Map<Long, float[]> vectors = new HashMap<>();
        for (MemoryChunk chunk : chunks) {
            float[] vector = embeddingService.fromJson(chunk.getEmbeddingJson());
            if (vector.length > 0) {
                vectors.put(chunk.getId(), vector);
            }
        }

        record Candidate(double score, Long source, Long target) {
        }
        List<Candidate> candidates = new ArrayList<>();
        for (int left = 0; left < chunks.size(); left++) {
            MemoryChunk source = chunks.get(left);
            float[] sourceVector = vectors.get(source.getId());
            if (sourceVector == null) {
                continue;
            }
            for (int right = left + 1; right < chunks.size(); right++) {
                MemoryChunk target = chunks.get(right);
                float[] targetVector = vectors.get(target.getId());
                if (targetVector == null || targetVector.length != sourceVector.length) {
                    continue;
                }
                double score = cosine(sourceVector, targetVector);
                if (score >= semanticThreshold) {
                    candidates.add(new Candidate(score, source.getId(), target.getId()));
                }
            }
        }
        candidates.sort(Comparator.comparingDouble(Candidate::score).reversed());

        Map<Long, Integer> degree = new HashMap<>();
        List<GraphEdgeView> edges = new ArrayList<>();
        for (Candidate candidate : candidates) {
            if (degree.getOrDefault(candidate.source(), 0) >= maxDegree
                    || degree.getOrDefault(candidate.target(), 0) >= maxDegree) {
                continue;
            }
            degree.merge(candidate.source(), 1, Integer::sum);
            degree.merge(candidate.target(), 1, Integer::sum);
            edges.add(new GraphEdgeView(
                    "sem:" + candidate.source() + ":" + candidate.target(),
                    "chunk:" + candidate.source(),
                    "chunk:" + candidate.target(),
                    "semantic",
                    round(candidate.score())));
        }
        return edges;
    }

    private List<GraphEdgeView> temporalEdges(List<MemoryChunk> chunks) {
        Map<String, List<MemoryChunk>> byCategory = new TreeMap<>();
        for (MemoryChunk chunk : chunks) {
            byCategory.computeIfAbsent(normalizeCategory(chunk.getCategory()), key -> new ArrayList<>()).add(chunk);
        }
        List<GraphEdgeView> edges = new ArrayList<>();
        for (List<MemoryChunk> group : byCategory.values()) {
            group.sort(Comparator
                    .comparing(MemoryChunk::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(MemoryChunk::getId));
            for (int index = 1; index < group.size(); index++) {
                MemoryChunk previous = group.get(index - 1);
                MemoryChunk current = group.get(index);
                edges.add(new GraphEdgeView(
                        "tmp:" + previous.getId() + ":" + current.getId(),
                        "chunk:" + previous.getId(),
                        "chunk:" + current.getId(),
                        "temporal",
                        0.5));
            }
        }
        return edges;
    }

    private static double importanceOf(MemoryChunk chunk) {
        double base = switch (normalizeCategory(chunk.getCategory())) {
            case CATEGORY_FACT -> 0.70;
            case CATEGORY_PROMISE -> 0.75;
            case CATEGORY_HABIT -> 0.72;
            default -> 0.55;
        };
        Instant createdAt = chunk.getCreatedAt();
        if (createdAt != null && createdAt.isAfter(Instant.now().minus(Duration.ofDays(7)))) {
            base += 0.15;
        }
        if (chunk.getImportance() != null) {
            base = Math.max(base, chunk.getImportance().doubleValue());
        }
        return Math.max(0.30, Math.min(0.95, base));
    }

    private static double angleOf(String category, Long id) {
        double base = BASE_ANGLES.getOrDefault(category, 0.0);
        int offset = Math.floorMod(Long.hashCode(id), 111) - 55;
        return base + offset;
    }

    private static String normalizeCategory(String category) {
        if (CATEGORY_FACT.equals(category) || CATEGORY_PROMISE.equals(category)
                || CATEGORY_HABIT.equals(category) || CATEGORY_EPISODE.equals(category)) {
            return category;
        }
        return CATEGORY_EPISODE;
    }

    private static String layoutSeed(Long userId, Long characterId) {
        long mixed = (userId == null ? 0 : userId) * 31L + (characterId == null ? 0 : characterId);
        return Long.toHexString(mixed);
    }

    private static double cosine(float[] left, float[] right) {
        double sum = 0;
        for (int index = 0; index < left.length; index++) {
            sum += left[index] * right[index];
        }
        return sum;
    }

    private static double round(double value) {
        return BigDecimal.valueOf(value).setScale(4, RoundingMode.HALF_UP).doubleValue();
    }
}
