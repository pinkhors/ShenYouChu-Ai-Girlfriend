package com.shenyouchu.core.voice.provider;

import java.time.Instant;
import java.util.List;

/** 批量生成视图；status: running/succeeded/failed/partial/expired。 */
public record VoiceBatchView(
        String batchId,
        String status,
        Instant createdAt,
        Instant expiresAt,
        List<VoiceSegmentView> segments
) {
}
