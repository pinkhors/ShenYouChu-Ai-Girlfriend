package com.shenyouchu.core.expression;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProactivePolicyTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final Instant NOW = local("2026-10-29T12:00:00");
    private static final Instant HISTORY = local("2026-10-28T20:00:00");
    private static final Instant LAST_PROACTIVE = local("2026-10-28T19:00:00");
    private static final Instant NEXT_MIDNIGHT = local("2026-10-30T00:00:00");

    private final ProactivePolicy policy = new ProactivePolicy();

    @Test
    void allowsWhenAllGatesPass() {
        ProactiveDecision decision = evaluate(ctx().build());

        assertTrue(decision.allowed());
        assertEquals(ProactiveBlockReason.NONE, decision.reason());
        assertEquals("follow_up", decision.scene());
        assertEquals(2, decision.dailyLimit());
        assertEquals(0, decision.usedToday());
        assertNull(decision.nextEligibleAt());
    }

    @Test
    void blocksPrivacyDisabledFirst() {
        ProactiveDecision decision = evaluate(ctx()
                .privacyDisabled(true)
                .userBusy(true)
                .lastUserMessageAt(null)
                .unansweredCount(2)
                .proactiveCountToday(3)
                .build());

        assertBlocked(decision, ProactiveBlockReason.PRIVACY_DISABLED);
        assertNull(decision.nextEligibleAt());
    }

    @Test
    void blocksBusyUserBeforeHistory() {
        ProactiveDecision decision = evaluate(ctx()
                .userBusy(true)
                .lastUserMessageAt(null)
                .build());

        assertBlocked(decision, ProactiveBlockReason.USER_BUSY);
        assertNull(decision.nextEligibleAt());
    }

    @Test
    void blocksWithoutUserHistory() {
        ProactiveDecision decision = evaluate(ctx().lastUserMessageAt(null).build());

        assertBlocked(decision, ProactiveBlockReason.NO_HISTORY);
        assertNull(decision.nextEligibleAt());
    }

    @Test
    void blocksQuietHoursAcrossMidnight() {
        ProactiveDecision lateEvening = evaluate(ctx()
                .now(local("2026-10-29T23:30:00"))
                .build());
        assertBlocked(lateEvening, ProactiveBlockReason.QUIET_HOURS);
        assertEquals(local("2026-10-30T08:00:00"), lateEvening.nextEligibleAt());

        ProactiveDecision earlyMorning = evaluate(ctx()
                .now(local("2026-10-29T07:00:00"))
                .build());
        assertBlocked(earlyMorning, ProactiveBlockReason.QUIET_HOURS);
        assertEquals(local("2026-10-29T08:00:00"), earlyMorning.nextEligibleAt());
    }

    @Test
    void quietBoundariesAreInclusiveAtStartAndExclusiveAtEnd() {
        assertBlocked(evaluate(ctx().now(local("2026-10-29T23:00:00")).build()),
                ProactiveBlockReason.QUIET_HOURS);
        assertTrue(evaluate(ctx().now(local("2026-10-29T22:59:00")).build()).allowed());
        assertTrue(evaluate(ctx().now(local("2026-10-29T08:00:00")).build()).allowed());
        assertFalse(evaluate(ctx().now(local("2026-10-29T07:59:00")).build()).allowed());
    }

    @Test
    void supportsQuietHoursWithinOneDay() {
        ProactiveDecision decision = evaluate(ctx()
                .now(local("2026-10-29T13:00:00"))
                .quietStart(LocalTime.of(12, 0))
                .quietEnd(LocalTime.of(14, 0))
                .build());

        assertBlocked(decision, ProactiveBlockReason.QUIET_HOURS);
        assertEquals(local("2026-10-29T14:00:00"), decision.nextEligibleAt());
        assertTrue(evaluate(ctx()
                .now(local("2026-10-29T14:00:00"))
                .quietStart(LocalTime.of(12, 0))
                .quietEnd(LocalTime.of(14, 0))
                .build()).allowed());
    }

    @Test
    void treatsEqualQuietStartAndEndAsAllDay() {
        ProactiveDecision decision = evaluate(ctx()
                .quietStart(LocalTime.of(12, 0))
                .quietEnd(LocalTime.of(12, 0))
                .build());

        assertBlocked(decision, ProactiveBlockReason.QUIET_HOURS);
        assertEquals(local("2026-10-30T12:00:00"), decision.nextEligibleAt());
    }

    @Test
    void blocksUnansweredLimit() {
        assertBlocked(evaluate(ctx().unansweredCount(2).build()),
                ProactiveBlockReason.UNANSWERED_LIMIT);
        assertTrue(evaluate(ctx().unansweredCount(1).build()).allowed());
    }

    @Test
    void appliesDailyLimitByInitiative() {
        ProactiveDecision low = evaluate(ctx().initiative("low").proactiveCountToday(1).build());
        assertBlocked(low, ProactiveBlockReason.DAILY_LIMIT);
        assertEquals(1, low.dailyLimit());
        assertEquals(1, low.usedToday());
        assertEquals(NEXT_MIDNIGHT, low.nextEligibleAt());

        ProactiveDecision medium = evaluate(ctx().initiative("medium").proactiveCountToday(2).build());
        assertBlocked(medium, ProactiveBlockReason.DAILY_LIMIT);
        assertEquals(2, medium.dailyLimit());

        ProactiveDecision high = evaluate(ctx().initiative("high").proactiveCountToday(3).build());
        assertBlocked(high, ProactiveBlockReason.DAILY_LIMIT);
        assertEquals(3, high.dailyLimit());

        ProactiveDecision fallback = evaluate(ctx().initiative("unknown").proactiveCountToday(2).build());
        assertBlocked(fallback, ProactiveBlockReason.DAILY_LIMIT);
        assertEquals(2, fallback.dailyLimit());

        assertTrue(evaluate(ctx().initiative("low").proactiveCountToday(0).build()).allowed());
    }

    @Test
    void dailyLimitDoesNotDependOnTemperature() {
        ProactiveDecision hot = evaluate(ctx()
                .initiative("medium")
                .temperature(0.95)
                .proactiveCountToday(2)
                .build());
        assertBlocked(hot, ProactiveBlockReason.DAILY_LIMIT);
        assertEquals(2, hot.dailyLimit());

        ProactiveDecision cold = evaluate(ctx()
                .initiative("low")
                .temperature(0.50)
                .proactiveCountToday(1)
                .build());
        assertBlocked(cold, ProactiveBlockReason.DAILY_LIMIT);
        assertEquals(1, cold.dailyLimit());
    }

    @Test
    void blocksWithinTenMinutesOfUserReply() {
        Instant lastUser = NOW.minus(Duration.ofMinutes(5));
        ProactiveDecision decision = evaluate(ctx().lastUserMessageAt(lastUser).build());

        assertBlocked(decision, ProactiveBlockReason.USER_JUST_REPLIED);
        assertEquals(lastUser.plus(Duration.ofMinutes(10)), decision.nextEligibleAt());

        assertTrue(evaluate(ctx().lastUserMessageAt(NOW.minus(Duration.ofMinutes(10))).build()).allowed());
        assertTrue(evaluate(ctx().lastUserMessageAt(NOW.minus(Duration.ofMinutes(11))).build()).allowed());
    }

    @Test
    void cooldownMinutesFollowTemperature() {
        assertEquals(53, ProactivePolicy.cooldownMinutes(0.59));
        assertEquals(45, ProactivePolicy.cooldownMinutes(0.60));
        assertEquals(45, ProactivePolicy.cooldownMinutes(0.74));
        assertEquals(45, ProactivePolicy.cooldownMinutes(0.85));
        assertEquals(39, ProactivePolicy.cooldownMinutes(0.86));
    }

    @Test
    void blocksWithinCooldownAndReportsNextEligibleAt() {
        Instant last = NOW.minus(Duration.ofMinutes(44));
        ProactiveDecision medium = evaluate(ctx().temperature(0.74).lastProactiveAt(last).build());
        assertBlocked(medium, ProactiveBlockReason.COOLDOWN);
        assertEquals(last.plus(Duration.ofMinutes(45)), medium.nextEligibleAt());

        assertTrue(evaluate(ctx().temperature(0.74)
                .lastProactiveAt(NOW.minus(Duration.ofMinutes(45))).build()).allowed());
    }

    @Test
    void lowTemperatureCoolsDownMoreSlowly() {
        ProactiveDecision blocked = evaluate(ctx()
                .temperature(0.59)
                .lastProactiveAt(NOW.minus(Duration.ofMinutes(52)))
                .build());
        assertBlocked(blocked, ProactiveBlockReason.COOLDOWN);
        assertEquals(NOW.plus(Duration.ofMinutes(1)), blocked.nextEligibleAt());

        assertTrue(evaluate(ctx().temperature(0.59)
                .lastProactiveAt(NOW.minus(Duration.ofMinutes(53))).build()).allowed());
    }

    @Test
    void highTemperatureCoolsDownFaster() {
        ProactiveDecision blocked = evaluate(ctx()
                .temperature(0.86)
                .lastProactiveAt(NOW.minus(Duration.ofMinutes(38)))
                .build());
        assertBlocked(blocked, ProactiveBlockReason.COOLDOWN);
        assertEquals(NOW.plus(Duration.ofMinutes(1)), blocked.nextEligibleAt());

        assertTrue(evaluate(ctx().temperature(0.86)
                .lastProactiveAt(NOW.minus(Duration.ofMinutes(39))).build()).allowed());
    }

    @Test
    void withoutPreviousProactiveMessageThereIsNoCooldown() {
        assertTrue(evaluate(ctx().lastProactiveAt(null).build()).allowed());
    }

    @Test
    void choosesSceneByExplicitRequestFirst() {
        assertEquals("share", evaluate(ctx().temperature(0.50).requestedScene("share").build()).scene());
        assertEquals("follow_up", evaluate(ctx().temperature(0.95).requestedScene("follow_up").build()).scene());
        assertEquals("reminder", evaluate(ctx().temperature(0.95).requestedScene("reminder").build()).scene());
    }

    @Test
    void choosesSceneByTemperatureWhenNotRequested() {
        assertEquals("share", evaluate(ctx().temperature(0.90).build()).scene());
        assertEquals("share", evaluate(ctx().temperature(0.85).build()).scene());
        assertEquals("follow_up", evaluate(ctx().temperature(0.84).build()).scene());
        assertEquals("follow_up", evaluate(ctx().temperature(0.60).build()).scene());
        assertEquals("follow_up", evaluate(ctx().temperature(0.30).build()).scene());
        assertEquals("share", evaluate(ctx().temperature(0.90).requestedScene("bogus").build()).scene());
    }

    @Test
    void blockedDecisionStillReportsChosenScene() {
        ProactiveDecision decision = evaluate(ctx()
                .now(local("2026-10-29T23:30:00"))
                .requestedScene("reminder")
                .build());

        assertBlocked(decision, ProactiveBlockReason.QUIET_HOURS);
        assertEquals("reminder", decision.scene());
    }

    @Test
    void respectsSectionEightOneOrder() {
        assertBlocked(evaluate(ctx()
                .now(local("2026-10-29T23:30:00"))
                .unansweredCount(2)
                .proactiveCountToday(3)
                .lastUserMessageAt(NOW.minus(Duration.ofMinutes(1)))
                .lastProactiveAt(NOW.minus(Duration.ofMinutes(1)))
                .build()), ProactiveBlockReason.QUIET_HOURS);

        assertBlocked(evaluate(ctx()
                .unansweredCount(2)
                .proactiveCountToday(2)
                .lastUserMessageAt(NOW.minus(Duration.ofMinutes(1)))
                .build()), ProactiveBlockReason.UNANSWERED_LIMIT);

        assertBlocked(evaluate(ctx()
                .proactiveCountToday(2)
                .lastUserMessageAt(NOW.minus(Duration.ofMinutes(1)))
                .build()), ProactiveBlockReason.DAILY_LIMIT);

        assertBlocked(evaluate(ctx()
                .lastUserMessageAt(NOW.minus(Duration.ofMinutes(1)))
                .lastProactiveAt(NOW.minus(Duration.ofMinutes(1)))
                .build()), ProactiveBlockReason.USER_JUST_REPLIED);
    }

    private ProactiveDecision evaluate(ProactiveContext context) {
        return policy.evaluate(context);
    }

    private static void assertBlocked(ProactiveDecision decision, ProactiveBlockReason reason) {
        assertFalse(decision.allowed());
        assertEquals(reason, decision.reason());
    }

    private static Instant local(String dateTime) {
        return LocalDateTime.parse(dateTime).atZone(ZONE).toInstant();
    }

    private static Ctx ctx() {
        return new Ctx();
    }

    /** 测试用的可变上下文构造器，所有默认值都远离边界。 */
    private static final class Ctx {

        private Instant now = NOW;
        private ZoneId zone = ZONE;
        private Instant lastUserMessageAt = HISTORY;
        private Instant lastProactiveAt = LAST_PROACTIVE;
        private int proactiveCountToday = 0;
        private int unansweredCount = 0;
        private LocalTime quietStart = LocalTime.of(23, 0);
        private LocalTime quietEnd = LocalTime.of(8, 0);
        private String initiative = "medium";
        private double temperature = 0.74;
        private boolean userBusy = false;
        private boolean privacyDisabled = false;
        private String requestedScene = null;

        Ctx now(Instant value) {
            this.now = value;
            return this;
        }

        Ctx lastUserMessageAt(Instant value) {
            this.lastUserMessageAt = value;
            return this;
        }

        Ctx lastProactiveAt(Instant value) {
            this.lastProactiveAt = value;
            return this;
        }

        Ctx proactiveCountToday(int value) {
            this.proactiveCountToday = value;
            return this;
        }

        Ctx unansweredCount(int value) {
            this.unansweredCount = value;
            return this;
        }

        Ctx quietStart(LocalTime value) {
            this.quietStart = value;
            return this;
        }

        Ctx quietEnd(LocalTime value) {
            this.quietEnd = value;
            return this;
        }

        Ctx initiative(String value) {
            this.initiative = value;
            return this;
        }

        Ctx temperature(double value) {
            this.temperature = value;
            return this;
        }

        Ctx userBusy(boolean value) {
            this.userBusy = value;
            return this;
        }

        Ctx privacyDisabled(boolean value) {
            this.privacyDisabled = value;
            return this;
        }

        Ctx requestedScene(String value) {
            this.requestedScene = value;
            return this;
        }

        ProactiveContext build() {
            return new ProactiveContext(now, zone, lastUserMessageAt, lastProactiveAt,
                    proactiveCountToday, unansweredCount, quietStart, quietEnd, initiative,
                    temperature, userBusy, privacyDisabled, requestedScene);
        }
    }
}
