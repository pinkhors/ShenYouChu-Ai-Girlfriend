package com.shenyouchu.core.memorygraph;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MemorySignalsTest {

    @Test
    void classifiesPromiseBeforePreference() {
        assertThat(MemorySignals.analyze("我答应你下次一定早点睡")).extracting(MemorySignals.Signals::category)
                .isEqualTo(MemorySignals.CATEGORY_PROMISE);
        assertThat(MemorySignals.analyze("我不吃香菜")).extracting(MemorySignals.Signals::category)
                .isEqualTo(MemorySignals.CATEGORY_FACT);
        assertThat(MemorySignals.analyze("今天项目上线了")).extracting(MemorySignals.Signals::category)
                .isEqualTo(MemorySignals.CATEGORY_EPISODE);
    }

    @Test
    void extractsTopicsAndEntities() {
        MemorySignals.Signals signals = MemorySignals.analyze("我下周要去面试，妈妈说别紧张，生日是10月12日");
        assertThat(signals.topics()).contains("工作", "关系");
        assertThat(signals.entities()).contains("10月12日", "妈妈");
    }

    @Test
    void summaryIsBounded() {
        String summary = MemorySignals.summaryOf("一".repeat(80));
        assertThat(summary).hasSize(25).endsWith("…");
    }

    @Test
    void parsesJsonListLeniently() {
        List<String> parsed = MemorySignals.parseJsonList("[\"生日\",\"工作\"]", List.of());
        assertThat(parsed).containsExactly("生日", "工作");
        assertThat(MemorySignals.parseJsonList("not-json", List.of("兜底"))).containsExactly("兜底");
    }
}
