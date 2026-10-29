package com.shenyouchu.core.expression;

import java.time.Instant;

/**
 * 主动开口判定结果（文档 09 §6.4 / §8）。
 *
 * @param allowed        是否允许开口
 * @param reason         阻塞原因；允许时为 {@link ProactiveBlockReason#NONE}
 * @param scene          本次开口场景：share / follow_up / reminder
 * @param dailyLimit     当天的主动消息上限
 * @param usedToday      今天已使用的主动消息数
 * @param nextEligibleAt 下次可开口时间；无明确时间或允许时为 {@code null}
 */
public record ProactiveDecision(
        boolean allowed,
        ProactiveBlockReason reason,
        String scene,
        int dailyLimit,
        int usedToday,
        Instant nextEligibleAt) {
}
