package com.shenyouchu.core.expression;

import java.util.List;

/**
 * 自动表达温度及其可读解释（文档 09 §6.2 / §7.1）。
 *
 * @param autoTemperature 自动温度，已四舍五入到 2 位并夹取到 [0.50, 0.95]
 * @param explanation     固定顺序的贡献清单：基础、主性格、调味、表达、形象、夹取后
 */
public record ExpressionTemperature(double autoTemperature, List<String> explanation) {

    public ExpressionTemperature {
        explanation = explanation == null ? List.of() : List.copyOf(explanation);
    }
}
