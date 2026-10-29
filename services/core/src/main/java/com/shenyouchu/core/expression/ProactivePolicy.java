package com.shenyouchu.core.expression;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Locale;

/**
 * 主动开口策略：硬性门槛、频率控制与场景选择（文档 09 §8.1–§8.3）。
 *
 * <p>判定严格按 §8.1 的顺序进行，命中即返回，温度不能绕过任何硬性门槛。
 * <p>纯逻辑：所有时间来自 {@link ProactiveContext}，不读取真实时钟。
 */
public final class ProactivePolicy {

    /** 用户刚回复的保护窗口。 */
    private static final Duration USER_JUST_REPLIED_WINDOW = Duration.ofMinutes(10);
    /** 连续未回复上限。 */
    private static final int UNANSWERED_LIMIT = 2;
    /** 冷却基准时长（分钟）。 */
    private static final int BASE_COOLDOWN_MINUTES = 45;

    /**
     * 按 §8.1 的 1–8 顺序判定是否可以主动开口。
     */
    public ProactiveDecision evaluate(ProactiveContext context) {
        ZoneId zone = context.zone() == null ? ZoneId.systemDefault() : context.zone();
        int dailyLimit = dailyLimit(context.initiative());
        int usedToday = context.proactiveCountToday();
        String scene = resolveScene(context.requestedScene(), context.temperature());

        if (context.privacyDisabled()) {
            return blocked(ProactiveBlockReason.PRIVACY_DISABLED, scene, dailyLimit, usedToday, null);
        }
        if (context.userBusy()) {
            return blocked(ProactiveBlockReason.USER_BUSY, scene, dailyLimit, usedToday, null);
        }
        if (context.lastUserMessageAt() == null) {
            return blocked(ProactiveBlockReason.NO_HISTORY, scene, dailyLimit, usedToday, null);
        }
        QuietWindow quiet = quietWindow(context.now(), zone, context.quietStart(), context.quietEnd());
        if (quiet.active()) {
            return blocked(ProactiveBlockReason.QUIET_HOURS, scene, dailyLimit, usedToday, quiet.nextEnd());
        }
        if (context.unansweredCount() >= UNANSWERED_LIMIT) {
            return blocked(ProactiveBlockReason.UNANSWERED_LIMIT, scene, dailyLimit, usedToday, null);
        }
        if (usedToday >= dailyLimit) {
            return blocked(ProactiveBlockReason.DAILY_LIMIT, scene, dailyLimit, usedToday,
                    nextMidnight(context.now(), zone));
        }
        if (Duration.between(context.lastUserMessageAt(), context.now())
                .compareTo(USER_JUST_REPLIED_WINDOW) < 0) {
            return blocked(ProactiveBlockReason.USER_JUST_REPLIED, scene, dailyLimit, usedToday,
                    context.lastUserMessageAt().plus(USER_JUST_REPLIED_WINDOW));
        }
        if (context.lastProactiveAt() != null) {
            Duration cooldown = Duration.ofMinutes(cooldownMinutes(context.temperature()));
            if (Duration.between(context.lastProactiveAt(), context.now()).compareTo(cooldown) < 0) {
                return blocked(ProactiveBlockReason.COOLDOWN, scene, dailyLimit, usedToday,
                        context.lastProactiveAt().plus(cooldown));
            }
        }
        return new ProactiveDecision(true, ProactiveBlockReason.NONE, scene, dailyLimit, usedToday, null);
    }

    /** 日上限只由主动程度决定，温度不改变它。 */
    private static int dailyLimit(String initiative) {
        String normalized = initiative == null ? "" : initiative.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "low" -> 1;
            case "high" -> 3;
            default -> 2;
        };
    }

    /**
     * 冷却 = round(45 / coefficient)。
     * 低温（&lt;0.60）系数 0.85 → 53 分钟；高温（&gt;0.85）系数 1.15 → 39 分钟；其余 45 分钟。
     */
    static int cooldownMinutes(double temperature) {
        double coefficient = temperature < 0.60 ? 0.85 : (temperature > 0.85 ? 1.15 : 1.00);
        return (int) Math.round(BASE_COOLDOWN_MINUTES / coefficient);
    }

    /** 显式场景优先；否则温度 ≥ 0.85 选 share，其余（含 ≤ 0.60）选 follow_up。 */
    private static String resolveScene(String requestedScene, double temperature) {
        if (requestedScene != null) {
            String normalized = requestedScene.trim().toLowerCase(Locale.ROOT);
            if (normalized.equals("share") || normalized.equals("follow_up") || normalized.equals("reminder")) {
                return normalized;
            }
        }
        return temperature >= 0.85 ? "share" : "follow_up";
    }

    private static QuietWindow quietWindow(Instant now, ZoneId zone, LocalTime start, LocalTime end) {
        if (start == null || end == null) {
            return new QuietWindow(false, null);
        }
        LocalDateTime nowLocal = LocalDateTime.ofInstant(now, zone);
        LocalTime nowTime = nowLocal.toLocalTime();
        LocalDate today = nowLocal.toLocalDate();

        if (start.equals(end)) {
            // quietStart == quietEnd 视为全天免打扰。
            return new QuietWindow(true, today.plusDays(1).atTime(end).atZone(zone).toInstant());
        }
        if (start.isBefore(end)) {
            boolean active = !nowTime.isBefore(start) && nowTime.isBefore(end);
            return new QuietWindow(active, active ? today.atTime(end).atZone(zone).toInstant() : null);
        }
        // 跨午夜：[start, 24:00) ∪ [00:00, end)。
        boolean active = !nowTime.isBefore(start) || nowTime.isBefore(end);
        Instant nextEnd = null;
        if (active) {
            LocalDate endDate = nowTime.isBefore(end) ? today : today.plusDays(1);
            nextEnd = endDate.atTime(end).atZone(zone).toInstant();
        }
        return new QuietWindow(active, nextEnd);
    }

    private static Instant nextMidnight(Instant now, ZoneId zone) {
        return now.atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant();
    }

    private static ProactiveDecision blocked(ProactiveBlockReason reason, String scene, int dailyLimit,
                                             int usedToday, Instant nextEligibleAt) {
        return new ProactiveDecision(false, reason, scene, dailyLimit, usedToday, nextEligibleAt);
    }

    private record QuietWindow(boolean active, Instant nextEnd) {
    }
}
