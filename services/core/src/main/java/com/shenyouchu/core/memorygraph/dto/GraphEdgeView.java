package com.shenyouchu.core.memorygraph.dto;

/** 星链：ownership（星座归属）/ semantic（语义）/ temporal（时间相邻）。 */
public record GraphEdgeView(
        String id,
        String source,
        String target,
        String kind,
        double weight) {
}
