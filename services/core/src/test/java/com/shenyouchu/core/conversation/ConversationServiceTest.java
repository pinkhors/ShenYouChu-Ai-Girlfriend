package com.shenyouchu.core.conversation;

import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.CharacterService;
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
    private CharacterService characterService;
    @Mock
    private ConversationProvisioner conversationProvisioner;
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
                conversationMapper, characterService, conversationProvisioner,
                activityService, messageMapper, memoryMapper);
    }

    @Test
    void readingAnotherUsersConversationReturnsNotFound() {
        when(conversationMapper.selectOne(any())).thenReturn(null);

        assertThatThrownBy(() -> conversationService.get(1L, 2L))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("会话不存在");
    }

    @Test
    void deletingConversationReturnsConflictAndSuggestsClear() {
        Conversation conversation = new Conversation(1L, 2L, null);
        conversation.setId(3L);
        when(conversationMapper.selectOne(any())).thenReturn(conversation);

        assertThatThrownBy(() -> conversationService.delete(1L, 3L))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("清空聊天记录");
    }
}
