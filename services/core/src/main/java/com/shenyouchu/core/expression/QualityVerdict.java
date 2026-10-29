package com.shenyouchu.core.expression;

/**
 * 主动消息质量闸门的判定结果（文档 09 §8.5）。
 *
 * @param ok     是否通过
 * @param reason 失败原因：EMPTY / TOO_LONG / TOO_MANY_QUESTIONS / DUPLICATE /
 *               PRIVACY_SOLICITATION；通过时为 OK
 */
public record QualityVerdict(boolean ok, String reason) {
}
