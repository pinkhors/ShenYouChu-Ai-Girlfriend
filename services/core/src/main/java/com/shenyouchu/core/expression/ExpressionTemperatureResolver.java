package com.shenyouchu.core.expression;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 把自动温度、手动覆盖与场景偏移解析为生效温度（文档 09 §7.1）。
 *
 * <p>规则：
 * <ul>
 *   <li>manual 且 override 非空 → base = override；否则 base = autoTemperature</li>
 *   <li>加场景偏移后四舍五入到 2 位，再夹取到 [0.30, 1.20]</li>
 * </ul>
 */
public final class ExpressionTemperatureResolver {

    private static final double EFFECTIVE_MIN = 0.30;
    private static final double EFFECTIVE_MAX = 1.20;
    private static final double AUTO_MIN = 0.50;
    private static final double AUTO_MAX = 0.95;

    public double effectiveTemperature(double autoTemperature, String mode, Double override,
                                       ExpressionScene scene) {
        double base = "manual".equals(mode) && override != null ? override : autoTemperature;
        double offset = scene == null ? 0.0 : scene.offset();
        return round2(clamp(base + offset, EFFECTIVE_MIN, EFFECTIVE_MAX));
    }

    /** 自动温度的统一夹取：先夹取到 [0.50, 0.95]，再四舍五入到 2 位。 */
    public double autoClamp(double raw) {
        return round2(clamp(raw, AUTO_MIN, AUTO_MAX));
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
