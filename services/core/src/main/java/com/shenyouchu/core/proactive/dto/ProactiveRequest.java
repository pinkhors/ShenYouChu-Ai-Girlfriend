package com.shenyouchu.core.proactive.dto;

/**
 * 主动消息触发请求（文档 09 §6.4）。
 *
 * @param trigger 触发场景：share / follow_up / reminder；缺省由策略按温度选择
 */
public record ProactiveRequest(String trigger) {
}
