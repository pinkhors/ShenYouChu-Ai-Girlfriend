package com.shenyouchu.core.voice;

/** ASR 结果：M2 先只返回最终稿，流式中间稿在真实适配器接入后补充。 */
public record AsrResult(String text, double confidence) {
}
