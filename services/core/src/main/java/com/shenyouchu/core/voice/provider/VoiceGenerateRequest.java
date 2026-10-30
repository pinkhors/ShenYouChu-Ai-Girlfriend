package com.shenyouchu.core.voice.provider;

import java.util.List;

/** 工作台批量生成请求：single / single_two / dual。 */
public record VoiceGenerateRequest(String mode, List<VoiceSegmentInput> segments) {
}
