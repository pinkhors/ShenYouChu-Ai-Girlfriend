package com.shenyouchu.core.expression;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;

/**
 * 一次主动开口判定的输入快照（文档 09 §8.1）。
 *
 * <p>所有时间均由调用方注入，策略本身不读取真实时钟。
 *
 * @param now                 判定时刻
 * @param zone                计算免打扰与次日 00:00 的时区
 * @param lastUserMessageAt   会话中最后一条用户消息时间；{@code null} 表示没有历史
 * @param lastProactiveAt     最后一次主动消息时间；{@code null} 表示从未主动开口
 * @param proactiveCountToday 今日已发送的主动消息数
 * @param unansweredCount     连续未回复的主动消息数
 * @param quietStart          免打扰开始时间
 * @param quietEnd            免打扰结束时间；与 quietStart 相同视为全天
 * @param initiative          主动程度：low / medium / high
 * @param temperature         当前表达温度，用于调制冷却时长
 * @param userBusy            用户是否正在通话/专注
 * @param privacyDisabled     隐私/活动记录是否关闭
 * @param requestedScene      显式请求的场景：share / follow_up / reminder
 */
public record ProactiveContext(
        Instant now,
        ZoneId zone,
        Instant lastUserMessageAt,
        Instant lastProactiveAt,
        int proactiveCountToday,
        int unansweredCount,
        LocalTime quietStart,
        LocalTime quietEnd,
        String initiative,
        double temperature,
        boolean userBusy,
        boolean privacyDisabled,
        String requestedScene) {
}
