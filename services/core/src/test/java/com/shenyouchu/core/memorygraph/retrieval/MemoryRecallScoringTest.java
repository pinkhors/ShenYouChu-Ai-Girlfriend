package com.shenyouchu.core.memorygraph.retrieval;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * 检索打分的纯逻辑单测：不启动 Spring、不依赖 Mockito。
 *
 * <p>覆盖 08 §18.2 的配额与去重、§18.3 的打分与排序、时间新鲜度以及 120 code point 截断。
 */
class MemoryRecallScoringTest {

    private static final Instant NOW = Instant.parse("2026-10-29T12:00:00Z");

    /* ───────────────────────── 打分 ───────────────────────── */

    @Test
    void scoreIsCosinePlusWeightedRecencyAndImportance() {
        assertThat(MemoryRecallService.score(0.5, 1.0, 1.0)).isCloseTo(0.65, within(1e-9));
        assertThat(MemoryRecallService.score(0.0, 0.0, 0.0)).isCloseTo(0.0, within(1e-9));
        assertThat(MemoryRecallService.score(0.4, 0.0, 0.5)).isCloseTo(0.425, within(1e-9));
        /* 时间/重要度权重不能反超余弦的语义相关性 */
        assertThat(MemoryRecallService.score(0.9, 0.0, 0.0))
                .isGreaterThan(MemoryRecallService.score(0.7, 1.0, 1.0));
    }

    @Test
    void scoreClampsAuxiliarySignalsIntoUnitRange() {
        assertThat(MemoryRecallService.score(0.5, 5.0, -3.0)).isCloseTo(0.6, within(1e-9));
        assertThat(MemoryRecallService.score(0.5, Double.NaN, 2.0)).isCloseTo(0.55, within(1e-9));
    }

    /* ───────────────────────── 新鲜度 ───────────────────────── */

    @Test
    void recencyIsFullWithinSevenDays() {
        assertThat(MemoryRecallService.recency(NOW, NOW)).isCloseTo(1.0, within(1e-9));
        assertThat(MemoryRecallService.recency(NOW.minus(Duration.ofDays(3)), NOW)).isCloseTo(1.0, within(1e-9));
        assertThat(MemoryRecallService.recency(NOW.minus(Duration.ofDays(7)), NOW)).isCloseTo(1.0, within(1e-9));
        /* 未来时间（时钟漂移）按最新处理 */
        assertThat(MemoryRecallService.recency(NOW.plus(Duration.ofHours(2)), NOW)).isCloseTo(1.0, within(1e-9));
    }

    @Test
    void recencyDecaysLinearlyThenReachesZero() {
        /* 18.5 天 = 7 天全值 + 23 天窗口的中点 */
        assertThat(MemoryRecallService.recency(NOW.minus(Duration.ofHours(444)), NOW)).isCloseTo(0.5, within(1e-9));
        assertThat(MemoryRecallService.recency(NOW.minus(Duration.ofDays(10)), NOW))
                .isCloseTo(1.0 - 3.0 / 23.0, within(1e-9));
        assertThat(MemoryRecallService.recency(NOW.minus(Duration.ofDays(30)), NOW)).isCloseTo(0.0, within(1e-9));
        assertThat(MemoryRecallService.recency(NOW.minus(Duration.ofDays(90)), NOW)).isCloseTo(0.0, within(1e-9));
        assertThat(MemoryRecallService.recency(null, NOW)).isCloseTo(0.0, within(1e-9));
    }

    @Test
    void recencyNeverIncreasesWithAge() {
        double young = MemoryRecallService.recency(NOW.minus(Duration.ofDays(8)), NOW);
        double middle = MemoryRecallService.recency(NOW.minus(Duration.ofDays(20)), NOW);
        double old = MemoryRecallService.recency(NOW.minus(Duration.ofDays(29)), NOW);
        assertThat(young).isGreaterThanOrEqualTo(middle);
        assertThat(middle).isGreaterThanOrEqualTo(old);
    }

    /* ───────────────────────── 余弦 ───────────────────────── */

    @Test
    void cosineHandlesDimensionMismatchAndEmptyVectors() {
        assertThat(MemoryRecallService.cosine(new float[]{0.6f, 0.8f}, new float[]{0.6f, 0.8f}))
                .isNotNull()
                .isCloseTo(1.0, within(1e-6));
        assertThat(MemoryRecallService.cosine(new float[]{1f, 0f}, new float[]{0f, 1f}))
                .isNotNull()
                .isCloseTo(0.0, within(1e-6));

        assertThat(MemoryRecallService.cosine(new float[]{1f, 0f}, new float[]{1f, 0f, 0f})).isNull();
        assertThat(MemoryRecallService.cosine(new float[0], new float[0])).isNull();
        assertThat(MemoryRecallService.cosine(new float[]{0f, 0f}, new float[]{1f, 0f})).isNull();
        assertThat(MemoryRecallService.cosine(null, new float[]{1f})).isNull();
    }

    /* ───────────────────────── 文本 ───────────────────────── */

    @Test
    void textPrefersSummaryThenChunkTextAndTruncates120CodePoints() {
        assertThat(MemoryRecallService.textOf("摘要", "正文")).isEqualTo("摘要");
        assertThat(MemoryRecallService.textOf("   ", "正文")).isEqualTo("正文");
        assertThat(MemoryRecallService.textOf(null, "正文")).isEqualTo("正文");
        assertThat(MemoryRecallService.textOf(" ", null)).isEmpty();

        String emoji = "😀".repeat(150);
        String truncated = MemoryRecallService.textOf(null, emoji);
        assertThat(truncated.codePointCount(0, truncated.length())).isEqualTo(120);
        assertThat(truncated).hasSize(240);

        String chinese = "记".repeat(130);
        assertThat(MemoryRecallService.textOf(chinese, null)).hasSize(120);
        assertThat(MemoryRecallService.textOf("短", null)).isEqualTo("短");
    }

    /* ───────────────────────── 排序 / 配额 / 去重 ───────────────────────── */

    @Test
    void assembleSortsByScoreAndAppliesPerCategoryQuotas() {
        List<MemoryItem> items = new ArrayList<>();
        for (int index = 1; index <= 5; index++) {
            items.add(item("fact", "chunk:f" + index, 0.9 - index * 0.1));
        }
        for (int index = 1; index <= 4; index++) {
            items.add(item("promise", "chunk:p" + index, 0.8 - index * 0.1));
        }
        for (int index = 1; index <= 5; index++) {
            items.add(item("episode", "chunk:e" + index, 0.7 - index * 0.1));
        }
        items.add(item("summary", "chunk:s1", 0.6));
        items.add(item("summary", "chunk:s2", 0.5));
        for (int index = 1; index <= 3; index++) {
            items.add(item("habit", "chunk:h" + index, 0.4 - index * 0.1));
        }

        MemoryContext context = MemoryRecallService.assemble(items, "vector", 12L, false);

        assertThat(context.facts()).hasSize(3);
        assertThat(context.facts()).extracting(MemoryItem::source)
                .containsExactly("chunk:f1", "chunk:f2", "chunk:f3");
        assertThat(context.promises()).hasSize(2);
        assertThat(context.episodes()).hasSize(3);
        assertThat(context.summaries()).hasSize(1);
        assertThat(context.summaries()).extracting(MemoryItem::source).containsExactly("chunk:s1");
        assertThat(context.habits()).hasSize(2);
        assertThat(context.meta().mode()).isEqualTo("vector");
        assertThat(context.meta().tookMs()).isEqualTo(12L);
        assertThat(context.meta().degraded()).isFalse();
    }

    @Test
    void assembleRoutesUnknownCategoryToEpisodes() {
        List<MemoryItem> items = List.of(
                item("misc", "chunk:1", 0.9),
                item(null, "chunk:2", 0.8),
                item("EPISODE", "chunk:3", 0.7));
        MemoryContext context = MemoryRecallService.assemble(items, "vector", 0L, false);

        assertThat(context.episodes()).extracting(MemoryItem::source)
                .containsExactly("chunk:1", "chunk:2", "chunk:3");
        assertThat(context.facts()).isEmpty();
        assertThat(MemoryRecallService.normalizeType(" MISC ")).isEqualTo("episode");
    }

    @Test
    void assembleDedupesSameSourceKeepingHighestScore() {
        List<MemoryItem> items = List.of(
                item("fact", "chunk:7", 0.2),
                item("fact", "chunk:7", 0.8));
        MemoryContext context = MemoryRecallService.assemble(items, "vector", 0L, false);

        assertThat(context.facts()).hasSize(1);
        assertThat(context.facts().get(0).score()).isCloseTo(0.8, within(1e-9));
        assertThat(context.all()).hasSize(1);
    }

    @Test
    void assembleDedupesAcrossCategoriesByScore() {
        List<MemoryItem> items = List.of(
                item("fact", "chunk:9", 0.4),
                item("episode", "chunk:9", 0.9));
        MemoryContext context = MemoryRecallService.assemble(items, "vector", 0L, false);

        assertThat(context.facts()).isEmpty();
        assertThat(context.episodes()).extracting(MemoryItem::id).containsExactly("chunk:9");
        assertThat(context.all()).hasSize(1);
    }

    @Test
    void assembleKeepsItemsWithoutSource() {
        List<MemoryItem> items = List.of(
                new MemoryItem("a", "fact", "a", null, NOW, 0.5),
                new MemoryItem("b", "fact", "b", null, NOW, 0.4));
        MemoryContext context = MemoryRecallService.assemble(items, "vector", 0L, false);

        assertThat(context.facts()).hasSize(2);
    }

    @Test
    void allReturnsCategoriesInStableOrder() {
        MemoryContext context = MemoryRecallService.assemble(List.of(
                item("habit", "chunk:h", 0.3),
                item("fact", "chunk:f", 0.1),
                item("summary", "chunk:s", 0.2),
                item("promise", "chunk:p", 0.4),
                item("episode", "chunk:e", 0.5)), "vector", 0L, false);

        assertThat(context.all()).extracting(MemoryItem::type)
                .containsExactly("fact", "promise", "episode", "summary", "habit");
    }

    @Test
    void emptyContextReportsModeAndDegradedFlag() {
        MemoryContext context = MemoryContext.empty("keyword", true);

        assertThat(context.isEmpty()).isTrue();
        assertThat(context.all()).isEmpty();
        assertThat(context.meta().mode()).isEqualTo("keyword");
        assertThat(context.meta().tookMs()).isZero();
        assertThat(context.meta().degraded()).isTrue();
    }

    @Test
    void contextToleratesNullLists() {
        MemoryContext context = new MemoryContext(null, null, List.of(item("episode", "chunk:1", 0.5)),
                null, null, null);

        assertThat(context.isEmpty()).isFalse();
        assertThat(context.facts()).isEmpty();
        assertThat(context.meta().mode()).isEqualTo("empty");
        assertThat(context.meta().degraded()).isFalse();
    }

    @Test
    void chunkIdIsParsedFromSourceForRecallEvents() {
        assertThat(MemoryRecallService.chunkIdOf("chunk:42")).isEqualTo(42L);
        assertThat(MemoryRecallService.chunkIdOf("memory:42")).isNull();
        assertThat(MemoryRecallService.chunkIdOf("chunk:abc")).isNull();
        assertThat(MemoryRecallService.chunkIdOf(null)).isNull();
    }

    private static MemoryItem item(String type, String source, double score) {
        return new MemoryItem(source, type, "text-" + source, source, NOW, score);
    }
}
