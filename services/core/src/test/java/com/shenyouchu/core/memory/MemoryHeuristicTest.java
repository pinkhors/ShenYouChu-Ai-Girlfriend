package com.shenyouchu.core.memory;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MemoryHeuristicTest {

    @Test
    void preferenceIsClassified() {
        assertThat(MemoryService.classify("我很喜欢看电影")).isEqualTo("preference");
    }

    @Test
    void eventIsClassified() {
        assertThat(MemoryService.classify("今天面试通过了")).isEqualTo("event");
    }

    @Test
    void shortOrNeutralTextIsNotRemembered() {
        assertThat(MemoryService.classify("嗯")).isNull();
        assertThat(MemoryService.classify("随便聊聊天气怎么样")).isNull();
    }
}
