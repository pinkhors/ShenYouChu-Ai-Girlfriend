package com.shenyouchu.core.expression;

/**
 * 表达温度的使用场景及其偏移（文档 09 §7.6）。
 *
 * <p>场景偏移只作用于生效温度，不改变自动温度本身。
 */
public enum ExpressionScene {

    /** 普通回复。 */
    REPLY(0.0),
    /** 主动分享日常。 */
    PROACTIVE_SHARE(0.05),
    /** 主动追问。 */
    PROACTIVE_FOLLOW_UP(-0.03),
    /** 约定/提醒。 */
    PROACTIVE_REMINDER(-0.06);

    private final double offset;

    ExpressionScene(double offset) {
        this.offset = offset;
    }

    public double offset() {
        return offset;
    }
}
