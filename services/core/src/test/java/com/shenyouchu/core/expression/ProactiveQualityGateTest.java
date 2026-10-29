package com.shenyouchu.core.expression;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProactiveQualityGateTest {

    private final ProactiveQualityGate gate = new ProactiveQualityGate();

    @Test
    void rejectsBlankText() {
        assertFailure(gate.check(null, null), "EMPTY");
        assertFailure(gate.check("", null), "EMPTY");
        assertFailure(gate.check("   ", null), "EMPTY");
        assertFailure(gate.check("\n\t　", null), "EMPTY");
    }

    @Test
    void rejectsMoreThanOneHundredTwentyCharacters() {
        assertTrue(gate.check("好".repeat(120), null).ok());
        assertFailure(gate.check("好".repeat(121), null), "TOO_LONG");
    }

    @Test
    void countsUnicodeCodePointsForLength() {
        assertTrue(gate.check("😀".repeat(120), null).ok());
        assertFailure(gate.check("😀".repeat(121), null), "TOO_LONG");
    }

    @Test
    void rejectsMoreThanOneQuestionMark() {
        assertTrue(gate.check("你今天怎么样？", null).ok());
        assertFailure(gate.check("你今天怎么样？吃饭了吗？", null), "TOO_MANY_QUESTIONS");
        assertFailure(gate.check("你今天怎么样?吃饭了吗?", null), "TOO_MANY_QUESTIONS");
        assertFailure(gate.check("？？", null), "TOO_MANY_QUESTIONS");
    }

    @Test
    void rejectsDuplicateOfRecentAssistantMessage() {
        assertFailure(gate.check("今天有点想你了", List.of("今天有点想你了")), "DUPLICATE");
    }

    @Test
    void rejectsDuplicateAfterNormalization() {
        assertFailure(gate.check("今天 有点想你了", List.of("今天有点想你了！")), "DUPLICATE");
        assertFailure(gate.check("今天有点想你了。", List.of("今天，有点想你了")), "DUPLICATE");
    }

    @Test
    void rejectsMutualContainmentWithinTenCharacters() {
        assertFailure(gate.check("今天有点想你了", List.of("今天有点想你了记得早点休息")), "DUPLICATE");
        assertTrue(gate.check("今天有点想你了",
                List.of("今天有点想你了" + "嗯".repeat(11))).ok());
    }

    @Test
    void onlyComparesLastThreeAssistantMessages() {
        assertFailure(gate.check("今天有点想你了",
                List.of("第一句话", "第二句话", "今天有点想你了")), "DUPLICATE");
        assertTrue(gate.check("今天有点想你了",
                List.of("今天有点想你了", "第一句话", "第二句话", "第三句话")).ok());
    }

    @Test
    void toleratesMissingOrBlankRecentMessages() {
        assertTrue(gate.check("晚安，明天见", null).ok());
        assertTrue(gate.check("晚安，明天见", List.of()).ok());
        assertTrue(gate.check("晚安，明天见", List.of("", "   ")).ok());
    }

    @Test
    void rejectsPrivacySolicitation() {
        for (String word : List.of("身份证", "银行卡", "密码", "住址", "手机号")) {
            assertFailure(gate.check("可以告诉我你的" + word + "吗", null), "PRIVACY_SOLICITATION");
        }
    }

    @Test
    void appliesChecksInDocumentedOrder() {
        assertFailure(gate.check("身份证".repeat(41), null), "TOO_LONG");
        assertFailure(gate.check("可以告诉我你的身份证吗？还有银行卡吗？", null), "TOO_MANY_QUESTIONS");
        assertFailure(gate.check("可以告诉我你的身份证吗",
                List.of("可以告诉我你的身份证吗")), "DUPLICATE");
    }

    @Test
    void acceptsHealthyMessage() {
        QualityVerdict verdict = gate.check("晚安，明天见", List.of("今天有点想你了"));
        assertTrue(verdict.ok());
        assertEquals("OK", verdict.reason());
    }

    private static void assertFailure(QualityVerdict verdict, String reason) {
        assertFalse(verdict.ok());
        assertEquals(reason, verdict.reason());
    }
}
