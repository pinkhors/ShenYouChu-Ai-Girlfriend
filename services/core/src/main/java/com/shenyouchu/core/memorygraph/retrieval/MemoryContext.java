package com.shenyouchu.core.memorygraph.retrieval;

import java.util.ArrayList;
import java.util.List;

/**
 * 一次记忆检索的结果容器（文档 08 §17.3 / §18.2）。
 *
 * <p>五类记忆允许多数为空，{@code null} 统一收敛为空列表，调用方不必判空。
 * {@code summaries} / {@code habits} 在 P1 暂不产出，等夜间管线接入后填充，契约不变。
 */
public record MemoryContext(
        List<MemoryItem> facts,
        List<MemoryItem> promises,
        List<MemoryItem> episodes,
        List<MemoryItem> summaries,
        List<MemoryItem> habits,
        Meta meta) {

    public MemoryContext {
        facts = copyOf(facts);
        promises = copyOf(promises);
        episodes = copyOf(episodes);
        summaries = copyOf(summaries);
        habits = copyOf(habits);
        meta = meta == null ? new Meta("empty", 0L, false) : meta;
    }

    /** 检索元信息：模式、耗时、是否降级。 */
    public record Meta(String mode, long tookMs, boolean degraded) {
    }

    public boolean isEmpty() {
        return facts.isEmpty() && promises.isEmpty() && episodes.isEmpty()
                && summaries.isEmpty() && habits.isEmpty();
    }

    /** 固定顺序拼接五类记忆：facts → promises → episodes → summaries → habits。 */
    public List<MemoryItem> all() {
        List<MemoryItem> items = new ArrayList<>(facts.size() + promises.size() + episodes.size()
                + summaries.size() + habits.size());
        items.addAll(facts);
        items.addAll(promises);
        items.addAll(episodes);
        items.addAll(summaries);
        items.addAll(habits);
        return List.copyOf(items);
    }

    /** 空结果：{@code mode} 取 {@code empty}，{@code tookMs=0}。 */
    public static MemoryContext empty(String mode, boolean degraded) {
        return new MemoryContext(List.of(), List.of(), List.of(), List.of(), List.of(),
                new Meta(mode, 0L, degraded));
    }

    private static List<MemoryItem> copyOf(List<MemoryItem> items) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        List<MemoryItem> copy = new ArrayList<>(items.size());
        for (MemoryItem item : items) {
            if (item != null) {
                copy.add(item);
            }
        }
        return List.copyOf(copy);
    }
}
