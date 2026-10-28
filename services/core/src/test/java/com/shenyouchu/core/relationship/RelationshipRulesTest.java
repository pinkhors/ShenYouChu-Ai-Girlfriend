package com.shenyouchu.core.relationship;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RelationshipRulesTest {

    @Test
    void positiveTextRaisesMood() {
        assertThat(RelationshipRules.moodDelta("今天好开心，谢谢你")).isEqualTo(3);
    }

    @Test
    void negativeTextLowersMood() {
        assertThat(RelationshipRules.moodDelta("今天好累，有点难过")).isEqualTo(-2);
    }

    @Test
    void neutralTextKeepsMood() {
        assertThat(RelationshipRules.moodDelta("随便聊聊")).isZero();
        assertThat(RelationshipRules.moodDelta(null)).isZero();
    }

    @Test
    void boundsAreClamped() {
        assertThat(RelationshipRules.clampMood(120)).isEqualTo(100);
        assertThat(RelationshipRules.clampMood(-5)).isZero();
        assertThat(RelationshipRules.clampIntimacy(999)).isEqualTo(100);
    }
}
