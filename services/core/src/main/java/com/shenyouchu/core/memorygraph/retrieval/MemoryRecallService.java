package com.shenyouchu.core.memorygraph.retrieval;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.memory.MemoryService;
import com.shenyouchu.core.memory.dto.MemoryView;
import com.shenyouchu.core.memorygraph.MemoryChunk;
import com.shenyouchu.core.memorygraph.MemoryRecallEvent;
import com.shenyouchu.core.memorygraph.MemorySignals;
import com.shenyouchu.core.memorygraph.embedding.EmbeddingPort;
import com.shenyouchu.core.memorygraph.embedding.EmbeddingService;
import com.shenyouchu.core.memorygraph.mapper.MemoryChunkMapper;
import com.shenyouchu.core.memorygraph.mapper.MemoryRecallEventMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 记忆检索：chunk 向量召回 + 配额排序，产出 09 消费的 {@link MemoryContext}
 * （文档 08 §18，09 §8.6）。
 *
 * <p>只读 {@code memory_chunks}，每次真正选中的 chunk 写一条 {@code memory_recall_events}
 * （写入失败只记 debug，不影响回复）。embedding 或数据库异常时降级到
 * {@link MemoryService#list(Long, Long)} 的关键词记忆，保证回复链路不失败。
 *
 * <p>打分与配额是不依赖 Spring 的纯逻辑，抽成包内静态方法供单测直接调用。
 */
@Service
public class MemoryRecallService {

    private static final Logger log = LoggerFactory.getLogger(MemoryRecallService.class);

    static final int FACT_QUOTA = 3;
    static final int PROMISE_QUOTA = 2;
    static final int EPISODE_QUOTA = 3;
    static final int SUMMARY_QUOTA = 1;
    static final int HABIT_QUOTA = 2;

    /** 每条注入文本的 Unicode code point 上限（08 §18.2）。 */
    static final int MAX_TEXT_CODE_POINTS = 120;

    /** 7 天内不衰减。 */
    static final double RECENCY_FULL_DAYS = 7.0;
    /** 超过 30 天衰减到 0，中间线性过渡。 */
    static final double RECENCY_ZERO_DAYS = 30.0;
    static final double RECENCY_WEIGHT = 0.10;
    static final double IMPORTANCE_WEIGHT = 0.05;

    /** 关键词降级时最多取几条。 */
    static final int KEYWORD_LIMIT = 3;

    /** 向量打分的时间预算：超过后放弃剩余 chunk，返回已排好的部分（08 §18.4）。 */
    static final long RECALL_BUDGET_MS = 300;

    static final String TYPE_SUMMARY = "summary";
    static final String MODE_VECTOR = "vector";
    static final String MODE_KEYWORD = "keyword";
    static final String MODE_EMPTY = "empty";

    private final MemoryChunkMapper chunkMapper;
    private final MemoryRecallEventMapper recallEventMapper;
    private final EmbeddingService embeddingService;
    private final MemoryService memoryService;
    private final int maxChunks;

    public MemoryRecallService(MemoryChunkMapper chunkMapper,
                               MemoryRecallEventMapper recallEventMapper,
                               EmbeddingService embeddingService,
                               MemoryService memoryService,
                               @Value("${shenyouchu.memory.recall.max-chunks:300}") int maxChunks) {
        this.chunkMapper = chunkMapper;
        this.recallEventMapper = recallEventMapper;
        this.embeddingService = embeddingService;
        this.memoryService = memoryService;
        this.maxChunks = Math.max(maxChunks, 1);
    }

    /**
     * 召回一轮对话要注入的记忆。
     *
     * <p>query 为空、未指定角色时直接返回空上下文；查不到 chunk 或向量化失败时
     * 降级到关键词记忆，两者都为空则返回 {@code mode=empty}。
     */
    public MemoryContext recall(Long userId, Long characterId, String query, String turnId) {
        long startedAt = System.nanoTime();
        if (userId == null || characterId == null || query == null || query.isBlank()) {
            return MemoryContext.empty(MODE_EMPTY, false);
        }
        Instant now = Instant.now();

        List<MemoryChunk> chunks;
        try {
            chunks = queryChunks(userId, characterId);
        } catch (RuntimeException ex) {
            log.warn("读取记忆 chunk 失败，降级关键词记忆 user={} character={}: {}",
                    userId, characterId, ex.getMessage());
            return keywordFallback(userId, characterId, true, now, startedAt);
        }
        if (chunks.isEmpty()) {
            return keywordFallback(userId, characterId, false, now, startedAt);
        }

        EmbeddingPort.Embedding queryEmbedding = embedQuery(query);
        if (queryEmbedding == null || queryEmbedding.vector() == null || queryEmbedding.vector().length == 0) {
            return keywordFallback(userId, characterId, true, now, startedAt);
        }

        List<MemoryItem> candidates = new ArrayList<>(chunks.size());
        for (MemoryChunk chunk : chunks) {
            if (tookMs(startedAt) > RECALL_BUDGET_MS) {
                log.debug("向量打分超过 {}ms，放弃剩余 chunk user={} character={}",
                        RECALL_BUDGET_MS, userId, characterId);
                break;
            }
            if (chunk == null) {
                continue;
            }
            /* 维度不一致或没有向量：跳过该条，不抛错（08 §18.4） */
            Double cosine = cosine(queryEmbedding.vector(), embeddingService.fromJson(chunk.getEmbeddingJson()));
            if (cosine == null) {
                continue;
            }
            double score = score(cosine, recency(chunk.getCreatedAt(), now),
                    clamp01(chunk.getImportance()));
            candidates.add(toItem(chunk, score));
        }
        if (candidates.isEmpty()) {
            log.debug("本轮无可用向量 chunk，降级关键词记忆 user={} character={}", userId, characterId);
            return keywordFallback(userId, characterId, true, now, startedAt);
        }

        MemoryContext context = assemble(candidates, MODE_VECTOR, tookMs(startedAt), false);
        recordRecall(userId, characterId, turnId, context);
        return context;
    }

    /* ───────────────────────── 取数 ───────────────────────── */

    private List<MemoryChunk> queryChunks(Long userId, Long characterId) {
        List<MemoryChunk> chunks = chunkMapper.selectList(Wrappers.<MemoryChunk>lambdaQuery()
                .eq(MemoryChunk::getUserId, userId)
                .eq(MemoryChunk::getCharacterId, characterId)
                .isNull(MemoryChunk::getInvalidAt)
                .orderByDesc(MemoryChunk::getCreatedAt)
                .last("LIMIT " + maxChunks));
        return chunks == null ? List.of() : chunks;
    }

    private EmbeddingPort.Embedding embedQuery(String query) {
        try {
            return embeddingService.embed(query.trim());
        } catch (RuntimeException ex) {
            log.warn("查询向量化失败，降级关键词记忆：{}", ex.getMessage());
            return null;
        }
    }

    /**
     * 关键词降级：取最新的 {@value #KEYWORD_LIMIT} 条旧记忆作为 facts。
     *
     * <p>关键词记忆也为空时返回 {@code mode=empty}；{@code degraded} 保留调用方传入的
     * 失败标记，便于 09 区分“本来就没记忆”和“这一轮检索坏了”。
     */
    private MemoryContext keywordFallback(Long userId, Long characterId, boolean degraded,
                                          Instant now, long startedAt) {
        List<MemoryView> memories;
        try {
            memories = memoryService.list(userId, characterId);
        } catch (RuntimeException ex) {
            log.warn("关键词记忆读取失败 user={} character={}: {}", userId, characterId, ex.getMessage());
            return MemoryContext.empty(MODE_EMPTY, true);
        }
        if (memories == null || memories.isEmpty()) {
            return MemoryContext.empty(MODE_EMPTY, degraded);
        }

        List<MemoryItem> items = new ArrayList<>(KEYWORD_LIMIT);
        for (MemoryView view : memories) {
            if (view == null || view.content() == null || view.content().isBlank()) {
                continue;
            }
            String id = "memory:" + view.id();
            items.add(new MemoryItem(id, MemorySignals.CATEGORY_FACT,
                    truncate(view.content().trim(), MAX_TEXT_CODE_POINTS), id, view.createdAt(),
                    score(0.0, recency(view.createdAt(), now), 0.0)));
            if (items.size() >= KEYWORD_LIMIT) {
                break;
            }
        }
        if (items.isEmpty()) {
            return MemoryContext.empty(MODE_EMPTY, degraded);
        }
        return assemble(items, MODE_KEYWORD, tookMs(startedAt), degraded);
    }

    /* ───────────────────────── 召回日志 ───────────────────────── */

    /** 只记录真正注入的 chunk；写失败只记 debug，不影响回复（08 §18.3-7）。 */
    private void recordRecall(Long userId, Long characterId, String turnId, MemoryContext context) {
        int rank = 1;
        for (MemoryItem item : context.all()) {
            Long chunkId = chunkIdOf(item.source());
            if (chunkId == null) {
                continue;
            }
            try {
                MemoryRecallEvent event = new MemoryRecallEvent();
                event.setUserId(userId);
                event.setCharacterId(characterId);
                event.setChunkId(chunkId);
                event.setTurnId(turnId);
                event.setRankNo(rank);
                event.setInjected(true);
                recallEventMapper.insert(event);
            } catch (RuntimeException ex) {
                log.debug("写入召回事件失败 chunk={}", chunkId, ex);
            }
            rank++;
        }
    }

    /** 从 {@code chunk:12} 形式的 source 还原 chunk id；关键词记忆返回 null。 */
    static Long chunkIdOf(String source) {
        if (source == null || !source.startsWith("chunk:")) {
            return null;
        }
        try {
            return Long.parseLong(source.substring("chunk:".length()));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    /* ───────────────────────── 纯逻辑（可单测） ───────────────────────── */

    /**
     * 组装最终上下文：全局按分数降序 → 同 source 去重 → 按类型配额截断。
     *
     * <p>去重先于配额，避免同一来源占用两个名额；分数相同时保持输入顺序（稳定排序）。
     */
    static MemoryContext assemble(List<MemoryItem> items, String mode, long tookMs, boolean degraded) {
        List<MemoryItem> sorted = new ArrayList<>();
        if (items != null) {
            for (MemoryItem item : items) {
                if (item != null) {
                    sorted.add(item);
                }
            }
        }
        sorted.sort(Comparator.comparingDouble(MemoryItem::score).reversed());

        List<MemoryItem> facts = new ArrayList<>(FACT_QUOTA);
        List<MemoryItem> promises = new ArrayList<>(PROMISE_QUOTA);
        List<MemoryItem> episodes = new ArrayList<>(EPISODE_QUOTA);
        List<MemoryItem> summaries = new ArrayList<>(SUMMARY_QUOTA);
        List<MemoryItem> habits = new ArrayList<>(HABIT_QUOTA);

        Set<String> seenSources = new HashSet<>();
        for (MemoryItem item : sorted) {
            String source = item.source();
            if (source != null && !source.isBlank() && !seenSources.add(source)) {
                continue;
            }
            String type = normalizeType(item.type());
            List<MemoryItem> bucket = switch (type) {
                case MemorySignals.CATEGORY_FACT -> facts;
                case MemorySignals.CATEGORY_PROMISE -> promises;
                case TYPE_SUMMARY -> summaries;
                case MemorySignals.CATEGORY_HABIT -> habits;
                default -> episodes;
            };
            if (bucket.size() < quotaOf(type)) {
                bucket.add(item);
            }
        }
        return new MemoryContext(facts, promises, episodes, summaries, habits,
                new MemoryContext.Meta(mode, tookMs, degraded));
    }

    /** 分类归一：未知类型统一归 episodes。 */
    static String normalizeType(String type) {
        if (type == null) {
            return MemorySignals.CATEGORY_EPISODE;
        }
        String normalized = type.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case MemorySignals.CATEGORY_FACT,
                 MemorySignals.CATEGORY_PROMISE,
                 MemorySignals.CATEGORY_EPISODE,
                 MemorySignals.CATEGORY_HABIT,
                 TYPE_SUMMARY -> normalized;
            default -> MemorySignals.CATEGORY_EPISODE;
        };
    }

    static int quotaOf(String type) {
        return switch (type) {
            case MemorySignals.CATEGORY_FACT -> FACT_QUOTA;
            case MemorySignals.CATEGORY_PROMISE -> PROMISE_QUOTA;
            case TYPE_SUMMARY -> SUMMARY_QUOTA;
            case MemorySignals.CATEGORY_HABIT -> HABIT_QUOTA;
            default -> EPISODE_QUOTA;
        };
    }

    /** 余弦相似度；维度不一致、空向量或零向量返回 {@code null}，由调用方跳过该条。 */
    static Double cosine(float[] left, float[] right) {
        if (left == null || right == null || left.length == 0 || left.length != right.length) {
            return null;
        }
        double dot = 0;
        double leftNorm = 0;
        double rightNorm = 0;
        for (int index = 0; index < left.length; index++) {
            dot += (double) left[index] * right[index];
            leftNorm += (double) left[index] * left[index];
            rightNorm += (double) right[index] * right[index];
        }
        if (leftNorm == 0 || rightNorm == 0) {
            return null;
        }
        return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
    }

    /** 时间新鲜度：7 天内为 1，之后到 30 天线性衰减到 0；未来时间按最新处理。 */
    static double recency(Instant createdAt, Instant now) {
        if (createdAt == null || now == null) {
            return 0.0;
        }
        Duration age = Duration.between(createdAt, now);
        if (age.isNegative()) {
            return 1.0;
        }
        double days = age.toMillis() / (double) Duration.ofDays(1).toMillis();
        if (days <= RECENCY_FULL_DAYS) {
            return 1.0;
        }
        if (days >= RECENCY_ZERO_DAYS) {
            return 0.0;
        }
        return 1.0 - (days - RECENCY_FULL_DAYS) / (RECENCY_ZERO_DAYS - RECENCY_FULL_DAYS);
    }

    /** 综合分：cosine + 0.10 * recency + 0.05 * importance。 */
    static double score(double cosine, double recency, double importance) {
        return cosine + RECENCY_WEIGHT * clamp01(recency) + IMPORTANCE_WEIGHT * clamp01(importance);
    }

    /**
     * 注入文本：优先摘要，空则原文；按 Unicode code point 截断到 120，不切断代理对。
     */
    static String textOf(String summary, String chunkText) {
        String text = summary == null || summary.isBlank() ? chunkText : summary;
        if (text == null) {
            return "";
        }
        return truncate(text.trim(), MAX_TEXT_CODE_POINTS);
    }

    static String truncate(String text, int maxCodePoints) {
        if (text == null) {
            return null;
        }
        if (maxCodePoints <= 0) {
            return "";
        }
        if (text.codePointCount(0, text.length()) <= maxCodePoints) {
            return text;
        }
        return text.substring(0, text.offsetByCodePoints(0, maxCodePoints));
    }

    private static MemoryItem toItem(MemoryChunk chunk, double score) {
        String id = "chunk:" + chunk.getId();
        return new MemoryItem(id, normalizeType(chunk.getCategory()), textOf(chunk.getSummary(), chunk.getChunkText()),
                id, chunk.getCreatedAt(), score);
    }

    private static double clamp01(BigDecimal value) {
        if (value == null) {
            return 0.0;
        }
        return clamp01(value.doubleValue());
    }

    private static double clamp01(double value) {
        if (Double.isNaN(value)) {
            return 0.0;
        }
        return Math.max(0.0, Math.min(1.0, value));
    }

    private static long tookMs(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000L;
    }
}
