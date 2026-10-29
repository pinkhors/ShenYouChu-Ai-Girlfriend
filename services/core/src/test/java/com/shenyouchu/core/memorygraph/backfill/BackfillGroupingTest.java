package com.shenyouchu.core.memorygraph.backfill;

import com.shenyouchu.core.memorygraph.backfill.MemoryBackfillService.Turn;
import com.shenyouchu.core.message.Message;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 回填分组纯逻辑：不依赖 Spring 上下文与 Mockito。
 */
class BackfillGroupingTest {

    private static final long CONVERSATION_ID = 1001L;
    private static final long USER_ID = 7L;

    @Test
    void groupsUserAndAssistantIntoOneTurnPerTurnId() {
        List<Message> messages = List.of(
                message(11L, "turn-a", "user", "我不吃香菜"),
                message(12L, "turn-a", "assistant", "记住啦，下次点菜避开香菜"),
                message(13L, "turn-b", "user", "今天项目上线，加班到两点"),
                message(14L, "turn-b", "assistant", "辛苦了，早点休息"));

        List<Turn> turns = MemoryBackfillService.groupTurns(messages);

        assertThat(turns).hasSize(2);
        assertThat(turns).extracting(Turn::turnId).containsExactly("turn-a", "turn-b");
        assertThat(turns.get(0).complete()).isTrue();
        assertThat(turns.get(0).userMessageId()).isEqualTo(11L);
        assertThat(turns.get(0).userText()).isEqualTo("我不吃香菜");
        assertThat(turns.get(0).assistantMessageId()).isEqualTo(12L);
        assertThat(turns.get(0).assistantText()).isEqualTo("记住啦，下次点菜避开香菜");
    }

    @Test
    void marksTurnIncompleteWhenAssistantIsMissing() {
        List<Message> messages = List.of(
                message(21L, "turn-a", "user", "只有我问了一句"),
                message(22L, "turn-b", "user", "这句有回复"),
                message(23L, "turn-b", "assistant", "回复在这里"));

        List<Turn> turns = MemoryBackfillService.groupTurns(messages);

        assertThat(turns).extracting(Turn::turnId).containsExactly("turn-a", "turn-b");
        assertThat(turns).extracting(Turn::complete).containsExactly(false, true);
        assertThat(turns.get(0).assistantMessageId()).isNull();
        assertThat(turns.get(0).assistantText()).isNull();
        assertThat(turns.get(0).userText()).isEqualTo("只有我问了一句");
    }

    @Test
    void marksTurnIncompleteWhenUserIsMissing() {
        List<Message> messages = List.of(
                message(31L, "turn-a", "assistant", "只有她的一句"));

        List<Turn> turns = MemoryBackfillService.groupTurns(messages);

        assertThat(turns).hasSize(1);
        assertThat(turns.get(0).complete()).isFalse();
        assertThat(turns.get(0).userMessageId()).isNull();
        assertThat(turns.get(0).assistantText()).isEqualTo("只有她的一句");
    }

    @Test
    void keepsOneGroupAndFirstMessagesForDuplicateTurn() {
        List<Message> messages = List.of(
                message(41L, "turn-a", "user", "第一次提问"),
                message(42L, "turn-a", "assistant", "第一次回复"),
                message(43L, "turn-a", "user", "重试后的提问"),
                message(44L, "turn-a", "assistant", "重试后的回复"));

        List<Turn> turns = MemoryBackfillService.groupTurns(messages);

        assertThat(turns).hasSize(1);
        assertThat(turns.get(0).turnId()).isEqualTo("turn-a");
        assertThat(turns.get(0).userMessageId()).isEqualTo(41L);
        assertThat(turns.get(0).userText()).isEqualTo("第一次提问");
        assertThat(turns.get(0).assistantMessageId()).isEqualTo(42L);
        assertThat(turns.get(0).assistantText()).isEqualTo("第一次回复");
    }

    @Test
    void ordersTurnsByFirstMessageIdRegardlessOfInputOrder() {
        List<Message> messages = List.of(
                message(56L, "turn-c", "user", "第三轮"),
                message(57L, "turn-c", "assistant", "第三轮回复"),
                message(52L, "turn-b", "user", "第二轮"),
                message(53L, "turn-b", "assistant", "第二轮回复"),
                message(50L, "turn-a", "user", "第一轮"),
                message(51L, "turn-a", "assistant", "第一轮回复"));

        List<Turn> turns = MemoryBackfillService.groupTurns(messages);

        assertThat(turns).extracting(Turn::turnId).containsExactly("turn-a", "turn-b", "turn-c");
        assertThat(turns).extracting(Turn::userMessageId).containsExactly(50L, 52L, 56L);
    }

    @Test
    void ignoresMessagesWithoutTurnId() {
        Message withoutTurn = message(61L, null, "user", "没有 turn 的历史消息");
        Message blankTurn = message(62L, "  ", "assistant", "turn 为空白的消息");
        List<Message> messages = List.of(
                withoutTurn,
                blankTurn,
                message(63L, "turn-a", "user", "正常一轮"),
                message(64L, "turn-a", "assistant", "正常回复"));

        List<Turn> turns = MemoryBackfillService.groupTurns(messages);

        assertThat(turns).extracting(Turn::turnId).containsExactly("turn-a");
    }

    @Test
    void returnsEmptyForEmptyOrNullInput() {
        assertThat(MemoryBackfillService.groupTurns(null)).isEmpty();
        assertThat(MemoryBackfillService.groupTurns(List.of())).isEmpty();
    }

    private static Message message(Long id, String turnId, String role, String content) {
        Message message = new Message(CONVERSATION_ID, USER_ID, turnId, role, content);
        message.setId(id);
        return message;
    }
}
