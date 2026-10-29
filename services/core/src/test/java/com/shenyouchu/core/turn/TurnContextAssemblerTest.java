package com.shenyouchu.core.turn;

import com.shenyouchu.core.memory.dto.MemoryView;
import com.shenyouchu.core.message.Message;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 纯逻辑测试：普通回复上下文组装（文档 09 §8.6 / AC-16、AC-17）。
 */
class TurnContextAssemblerTest {

    private final TurnContextAssembler assembler = new TurnContextAssembler();

    private static Message message(String role, String content) {
        return new Message(1L, 1L, "turn", role, content);
    }

    private static MemoryView memory(String content) {
        return new MemoryView("1", "preference", content, "active", Instant.EPOCH, null, "2");
    }

    private static int charCount(String text) {
        return text.codePointCount(0, text.length());
    }

    @Test
    void conversationLinesKeepOrderAndRoleLabels() {
        String context = assembler.assemble(List.of(
                message("user", "今天面试有点紧张"),
                message("assistant", "别怕，我陪着你"),
                message("user", "谢谢"),
                message("assistant", "嗯，我一直都在")), List.of(), null, null);

        assertThat(context).isEqualTo(TurnContextAssembler.REFERENCE_PREFIX
                + "\n最近对话："
                + "\n用户：今天面试有点紧张"
                + "\n她：别怕，我陪着你"
                + "\n用户：谢谢"
                + "\n她：嗯，我一直都在");
    }

    @Test
    void atMostTenMostRecentMessagesAreUsed() {
        List<Message> messages = new ArrayList<>();
        for (int index = 1; index <= 12; index++) {
            messages.add(message("user", "消息" + index));
        }

        String context = assembler.assemble(messages, List.of(), null, null);

        assertThat(context).doesNotContain("用户：消息1\n").doesNotContain("用户：消息2\n");
        assertThat(context).contains("用户：消息3").contains("用户：消息12");
        long lines = context.lines().filter(line -> line.startsWith("用户：")).count();
        assertThat(lines).isEqualTo(10);
    }

    @Test
    void eachConversationLineIsTruncatedToThreeHundredChars() {
        String longText = "x".repeat(400);

        String context = assembler.assemble(List.of(message("user", longText)), List.of(), null, null);

        assertThat(context).contains("用户：" + "x".repeat(300));
        assertThat(context).doesNotContain("x".repeat(301));
        String line = context.lines().filter(value -> value.startsWith("用户：")).findFirst().orElseThrow();
        assertThat(charCount(line.substring("用户：".length()))).isEqualTo(300);
    }

    @Test
    void atMostFiveMemoriesAndEachTruncatedTo120Chars() {
        List<MemoryView> memories = new ArrayList<>();
        memories.add(memory("m".repeat(200)));
        for (int index = 2; index <= 7; index++) {
            memories.add(memory("记忆" + index));
        }

        String context = assembler.assemble(List.of(), memories, null, null);

        assertThat(context).contains("- " + "m".repeat(120));
        assertThat(context).doesNotContain("m".repeat(121));
        long lines = context.lines().filter(line -> line.startsWith("- ")).count();
        assertThat(lines).isEqualTo(5);
        String first = context.lines().filter(line -> line.startsWith("- ")).findFirst().orElseThrow();
        assertThat(charCount(first.substring("- ".length()))).isEqualTo(120);
    }

    @Test
    void relationshipSummaryIncludesKnownFieldsOnly() {
        String both = assembler.assemble(List.of(), List.of(), 62, 7);
        assertThat(both).isEqualTo(TurnContextAssembler.REFERENCE_PREFIX
                + "\n当前关系：心情 62/100，亲密度 7/100。");

        assertThat(assembler.assemble(List.of(), List.of(), 62, null))
                .contains("当前关系：心情 62/100。");
        assertThat(assembler.assemble(List.of(), List.of(), null, 7))
                .contains("当前关系：亲密度 7/100。");
        assertThat(assembler.assemble(List.of(), List.of(), null, null)).isEmpty();
    }

    @Test
    void emptyInputsProduceEmptyString() {
        assertThat(assembler.assemble(null, null, null, null)).isEmpty();
        assertThat(assembler.assemble(List.of(), List.of(), null, null)).isEmpty();
    }

    @Test
    void oversizeContextDropsEarliestDialogueButKeepsMemoriesAndRelationship() {
        List<Message> messages = new ArrayList<>();
        for (int index = 0; index <= 9; index++) {
            messages.add(message("user", "M" + index + "y".repeat(350)));
        }

        String context = assembler.assemble(messages, List.of(memory("喜欢猫")), 62, 7);

        assertThat(charCount(context)).isLessThanOrEqualTo(2000);
        assertThat(context).startsWith(TurnContextAssembler.REFERENCE_PREFIX);
        assertThat(context).doesNotContain("用户：M0");
        assertThat(context).doesNotContain("用户：M1");
        assertThat(context).contains("用户：M9");
        assertThat(context).contains("关于用户的记忆：").contains("- 喜欢猫");
        assertThat(context).contains("当前关系：心情 62/100，亲密度 7/100。");
    }
}
