package com.shenyouchu.core.proactive.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.Instant;

/**
 * 主动开口可开口性（文档 09 §6.4 / §8）。
 *
 * @param allowed        当前是否允许主动开口
 * @param reason         阻塞原因码（如 QUIET_HOURS）；允许时为 null
 * @param scene          本次会使用的场景：share / follow_up / reminder
 * @param dailyLimit     当日主动消息上限（由主动程度决定）
 * @param usedToday      今日已使用条数
 * @param nextEligibleAt 下次可开口时间；无明确时间时为 null
 */
public record ProactiveEligibilityView(
        boolean allowed,
        String reason,
        String scene,
        int dailyLimit,
        int usedToday,
        @JsonFormat(shape = JsonFormat.Shape.STRING) Instant nextEligibleAt) {
}
