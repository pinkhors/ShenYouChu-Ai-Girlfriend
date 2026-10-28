package com.shenyouchu.core.conversation;

import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.memory.mapper.MemoryMapper;
import com.shenyouchu.core.message.mapper.MessageMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConversationServiceTest {

    @Mock
    private ConversationMapper conversationMapper;
    @Mock
    private CharacterMapper characterMapper;
    @Mock
    private ActivityService activityService;
    @Mock
    private MessageMapper messageMapper;
    @Mock
    private MemoryMapper memoryMapper;

    private ConversationService conversationService;

    @BeforeEach
    void setUp() {
        conversationService = new ConversationService(
                conversationMapper, characterMapper, activityService, messageMapper, memoryMapper);
    }

    @Test
    void readingAnotherUsersConversationReturnsNotFound() {
        when(conversationMapper.selectOne(any())).thenReturn(null);

        assertThatThrownBy(() -> conversationService.get(1L, 2L))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("会话不存在");
    }
}
