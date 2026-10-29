package com.shenyouchu.core.expression;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ExpressionTemperatureResolverTest {

    private final ExpressionTemperatureResolver resolver = new ExpressionTemperatureResolver();

    @Test
    void sceneOffsetsMatchPrd() {
        assertEquals(0.00, ExpressionScene.REPLY.offset(), 1e-9);
        assertEquals(0.05, ExpressionScene.PROACTIVE_SHARE.offset(), 1e-9);
        assertEquals(-0.03, ExpressionScene.PROACTIVE_FOLLOW_UP.offset(), 1e-9);
        assertEquals(-0.06, ExpressionScene.PROACTIVE_REMINDER.offset(), 1e-9);
    }

    @Test
    void autoModeUsesAutoTemperatureAndIgnoresOverride() {
        assertEquals(0.74, resolver.effectiveTemperature(0.74, "auto", 0.90, ExpressionScene.REPLY), 1e-9);
        assertEquals(0.74, resolver.effectiveTemperature(0.74, "auto", null, ExpressionScene.REPLY), 1e-9);
        assertEquals(0.79, resolver.effectiveTemperature(0.74, "auto", 0.90,
                ExpressionScene.PROACTIVE_SHARE), 1e-9);
    }

    @Test
    void manualModePrefersOverride() {
        assertEquals(0.90, resolver.effectiveTemperature(0.74, "manual", 0.90,
                ExpressionScene.REPLY), 1e-9);
        assertEquals(0.95, resolver.effectiveTemperature(0.74, "manual", 0.90,
                ExpressionScene.PROACTIVE_SHARE), 1e-9);
        assertEquals(0.87, resolver.effectiveTemperature(0.74, "manual", 0.90,
                ExpressionScene.PROACTIVE_FOLLOW_UP), 1e-9);
        assertEquals(0.84, resolver.effectiveTemperature(0.74, "manual", 0.90,
                ExpressionScene.PROACTIVE_REMINDER), 1e-9);
    }

    @Test
    void manualModeWithoutOverrideFallsBackToAuto() {
        assertEquals(0.74, resolver.effectiveTemperature(0.74, "manual", null,
                ExpressionScene.REPLY), 1e-9);
    }

    @Test
    void unknownModeFallsBackToAuto() {
        assertEquals(0.74, resolver.effectiveTemperature(0.74, "invalid", 0.90,
                ExpressionScene.REPLY), 1e-9);
    }

    @Test
    void appliesSceneOffsetsToBoundaryValues() {
        assertEquals(1.00, resolver.effectiveTemperature(0.95, "auto", null,
                ExpressionScene.PROACTIVE_SHARE), 1e-9);
        assertEquals(0.92, resolver.effectiveTemperature(0.95, "auto", null,
                ExpressionScene.PROACTIVE_FOLLOW_UP), 1e-9);
        assertEquals(0.89, resolver.effectiveTemperature(0.95, "auto", null,
                ExpressionScene.PROACTIVE_REMINDER), 1e-9);
        assertEquals(0.44, resolver.effectiveTemperature(0.50, "auto", null,
                ExpressionScene.PROACTIVE_REMINDER), 1e-9);
    }

    @Test
    void clampsEffectiveTemperatureToThirtyAndOneTwenty() {
        assertEquals(0.30, resolver.effectiveTemperature(0.30, "manual", 0.30,
                ExpressionScene.PROACTIVE_REMINDER), 1e-9);
        assertEquals(1.20, resolver.effectiveTemperature(1.20, "manual", 1.20,
                ExpressionScene.PROACTIVE_SHARE), 1e-9);
        assertEquals(0.30, resolver.effectiveTemperature(-5.0, "auto", null,
                ExpressionScene.REPLY), 1e-9);
        assertEquals(1.20, resolver.effectiveTemperature(5.0, "auto", null,
                ExpressionScene.REPLY), 1e-9);
    }

    @Test
    void roundsToTwoDecimals() {
        assertEquals(0.79, resolver.effectiveTemperature(0.74, "auto", null,
                ExpressionScene.PROACTIVE_SHARE), 1e-9);
        assertEquals(0.75, resolver.effectiveTemperature(0.745, "auto", null,
                ExpressionScene.REPLY), 1e-9);
        assertEquals(0.74, resolver.effectiveTemperature(0.744, "auto", null,
                ExpressionScene.REPLY), 1e-9);
    }

    @Test
    void treatsNullSceneAsReply() {
        assertEquals(0.74, resolver.effectiveTemperature(0.74, "auto", null, null), 1e-9);
    }

    @Test
    void autoClampAppliesAutomaticRange() {
        assertEquals(0.50, resolver.autoClamp(0.20), 1e-9);
        assertEquals(0.50, resolver.autoClamp(0.50), 1e-9);
        assertEquals(0.95, resolver.autoClamp(0.95), 1e-9);
        assertEquals(0.95, resolver.autoClamp(1.40), 1e-9);
        assertEquals(0.74, resolver.autoClamp(0.744), 1e-9);
        assertEquals(0.75, resolver.autoClamp(0.745), 1e-9);
    }
}
