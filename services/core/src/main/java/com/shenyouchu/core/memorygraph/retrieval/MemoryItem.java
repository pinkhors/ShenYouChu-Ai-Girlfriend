package com.shenyouchu.core.memorygraph.retrieval;

import java.time.Instant;

/**
 * 一条可注入的记忆（文档 08 §17.3 / §18.2）。
 *
 * <p>{@code id} 与 {@code source} 在 v1.1 取同一个值（如 {@code chunk:12}），
 * 便于 09 只依赖稳定字段做去重；{@code score} 是 08 内部排序分，09 不解释它。
 */
public record MemoryItem(String id, String type, String text, String source, Instant createdAt, double score) {
}
