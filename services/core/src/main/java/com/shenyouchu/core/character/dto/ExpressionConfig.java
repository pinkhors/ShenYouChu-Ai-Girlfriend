package com.shenyouchu.core.character.dto;

/**
 * 人设 v2 的表达温度配置（文档 09 §6.1 / §6.3）。
 *
 * <p>{@code mode} 只允许 {@code auto} / {@code manual}；{@code manual} 必须携带
 * 0.30–1.20 的 {@code temperatureOverride}，{@code auto} 时该值被忽略并持久化为 null。
 *
 * @param mode                表达方式：auto（自动推导）或 manual（手动覆盖）
 * @param temperatureOverride 手动覆盖值；仅 manual 时有意义
 */
public record ExpressionConfig(String mode, Double temperatureOverride) {

    public static final String MODE_AUTO = "auto";
    public static final String MODE_MANUAL = "manual";

    /** 缺省配置：自动推导、无覆盖值。 */
    public static ExpressionConfig auto() {
        return new ExpressionConfig(MODE_AUTO, null);
    }
}
