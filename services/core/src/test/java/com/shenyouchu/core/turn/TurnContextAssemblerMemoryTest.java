package com.shenyouchu.core.turn;

import com.shenyouchu.core.memorygraph.retrieval.MemoryContext;
import com.shenyouchu.core.memorygraph.retrieval.MemoryItem;
import com.shenyouchu.core.message.Message;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** v1.1：记忆上下文（文档 08 §18 / 09 §8.6）的纯逻辑测试。 */
class TurnContextAssemblerMemoryTest {

    private final TurnContextAssembler assembler = new TurnContextAssembler();

    @Test
    void rendersMemorySectionsInOrder() {
        List<Message> messages = List.of(
                message("user", "我今天面试好紧张"),
                message("assistant", "先深呼吸，你准备很久了"));

        MemoryContext memory = new MemoryContext(
                List.of(item("chunk:1", "fact", "不喜欢香菜")),
                List.of(item("chunk:2", "promise", "答应下次早点睡")),
                List.of(item("chunk:3", "episode", "上周面试很紧张")),
                List.of(item("summary:1", "summary", "这一周在准备面试")),
                List.of(),
                new MemoryContext.Meta("vector", 42L, false));

        String context = assembler.assembleMemory(messages, memory, 62, 7,
                Instant.parse("2026-10-29T12:15:00Z"),
                Instant.parse("2026-09-23T00:00:00Z"));

        assertThat(context).contains("只作为事实参考");
        assertThat(context).contains("现在：");
        assertThat(context).contains("认识第 37 天");
        assertThat(context).contains("关于你");
        assertThat(context).contains("你们的约定 / 待办");
        assertThat(context).contains("长期概况");
        assertThat(context).contains("最近的经历");
        assertThat(context).contains("最近对话");
        assertThat(context).contains("当前关系：心情 62/100，亲密度 7/100");
        assertThat(context.indexOf("关于你")).isLessThan(context.indexOf("最近对话"));
    }

    @Test
    void emptyMemoryKeepsDialogAndRelationship() {
        String context = assembler.assembleMemory(
                List.of(message("user", "在吗")),
                MemoryContext.empty("empty", true),
                50, 0, Instant.now(), null);

        assertThat(context).contains("最近对话");
        assertThat(context).contains("当前关系");
        assertThat(context).doesNotContain("关于你");
        assertThat(context).doesNotContain("你们的约定");
    }

    @Test
    void truncatesOldestDialogBeforeFacts() {
        List<Message> messages = new ArrayList<>();
        for (int index = 0; index < 10; index++) {
            messages.add(message(index % 2 == 0 ? "user" : "assistant",
                    "第" + index + "轮" + "很长".repeat(140)));
        }
        MemoryContext memory = new MemoryContext(
                List.of(item("chunk:1", "fact", "不喜欢香菜")),
                List.of(item("chunk:2", "promise", "答应下次早点睡")),
                List.of(item("chunk:3", "episode", "上周面试很紧张")),
                List.of(),
                List.of(),
                new MemoryContext.Meta("vector", 10L, false));

        String context = assembler.assembleMemory(messages, memory, 50, 0,
                Instant.now(), Instant.now().minus(3, ChronoUnit.DAYS));

        assertThat(context.codePointCount(0, context.length()))
                .isLessThanOrEqualTo(TurnContextAssembler.MAX_MEMORY_CONTEXT_CHARS);
        assertThat(context).contains("不喜欢香菜");
        assertThat(context).contains("答应下次早点睡");
        assertThat(context).doesNotContain("第0轮");
    }

    @Test
    void deduplicatesIdenticalMemoryText() {
        MemoryContext memory = new MemoryContext(
                List.of(item("chunk:1", "fact", "不喜欢香菜"), item("chunk:2", "fact", "不喜欢香菜")),
                List.of(), List.of(), List.of(), List.of(),
                new MemoryContext.Meta("vector", 1L, false));

        String context = assembler.assembleMemory(List.of(), memory, null, null,
                Instant.now(), null);

        assertThat(context.split("不喜欢香菜", -1)).hasSize(2);
    }

    private static Message message(String role, String content) {
        return new Message(1L, 1L, "turn", role, content);
    }

    private static MemoryItem item(String id, String type, String text) {
        return new MemoryItem(id, type, text, id, Instant.now(), 0.9);
    }
}
