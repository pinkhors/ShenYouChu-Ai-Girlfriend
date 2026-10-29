package com.shenyouchu.core.character.dto;

import java.util.List;

/**
 * 角色视图中的表达温度快照（文档 09 §6.2）。
 *
 * <p>自动值、生效值与来源同时返回：前端只展示，不自行推导。
 * 官方角色不返回该对象（{@code expression: null}）。
 *
 * @param mode                 表达方式：auto / manual
 * @param temperatureOverride  手动覆盖值；auto 时为 null
 * @param autoTemperature      按角色设定推导出的自动值，落在 0.50–0.95
 * @param effectiveTemperature 当前生效值（override ?? auto，再按场景夹取）
 * @param source               生效值来源：auto / manual
 * @param explanation          固定顺序的中文贡献清单：基础 → 主性格 → 调味 → 表达 → 形象 → 夹取
 */
public record ExpressionView(
        String mode,
        Double temperatureOverride,
        double autoTemperature,
        double effectiveTemperature,
        String source,
        List<String> explanation) {

    public ExpressionView {
        explanation = explanation == null ? List.of() : List.copyOf(explanation);
    }
}
