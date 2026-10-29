package com.shenyouchu.core.memorygraph.dto;

/** 星座：固定四类记忆的方位与计数。 */
public record ConstellationView(
        String id,
        String label,
        String kind,
        int count,
        double angle,
        double radius) {
}
