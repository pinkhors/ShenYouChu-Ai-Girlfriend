package com.shenyouchu.core.llm.settings.dto;

/** 设置页“测试连接”的结果；error 已截断，不包含 Key。 */
public record LlmTestResult(boolean ok, long latencyMs, String model, String error) {
}
