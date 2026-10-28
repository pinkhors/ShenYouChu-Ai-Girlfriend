package com.shenyouchu.core.llm.settings;

import com.shenyouchu.core.llm.LlmDefaults;
import com.shenyouchu.core.llm.LlmHttpClient;
import com.shenyouchu.core.llm.settings.dto.LlmSettingsRequest;
import com.shenyouchu.core.llm.settings.mapper.UserLlmSettingsMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserLlmSettingsServiceTest {

    private final UserLlmSettingsMapper mapper = mock(UserLlmSettingsMapper.class);
    private final LlmHttpClient httpClient = mock(LlmHttpClient.class);
    private final LlmDefaults defaults = new LlmDefaults(
            true, "https://env.example.com/v1", "env-key", "env-model", 256, 0.8, 30);
    private final UserLlmSettingsService service =
            new UserLlmSettingsService(mapper, defaults, httpClient);

    @Test
    void firstSaveWithoutKeyIsRejectedWhenEnvHasUsableKey() {
        when(mapper.selectById(1L)).thenReturn(null);

        assertThatThrownBy(() -> service.save(1L,
                new LlmSettingsRequest(true, "https://api.deepseek.com/v1", "deepseek-chat", "", 512, 0.8, 60)))
                .hasMessageContaining("API Key");
        verify(mapper, never()).insert(any(UserLlmSettings.class));
    }

    @Test
    void disablingLlmAllowsFirstSaveWithoutKey() {
        when(mapper.selectById(1L)).thenReturn(null);

        service.save(1L, new LlmSettingsRequest(false, "", "", "", 512, 0.8, 60));

        verify(mapper).insert(any(UserLlmSettings.class));
    }

    @Test
    void blankKeyOnUpdateKeepsExistingKey() {
        UserLlmSettings existing = new UserLlmSettings(1L);
        existing.setEnabled(true);
        existing.setBaseUrl("https://old.example.com/v1");
        existing.setModel("old-model");
        existing.setApiKey("sk-old");
        when(mapper.selectById(1L)).thenReturn(existing);

        service.save(1L,
                new LlmSettingsRequest(true, "https://new.example.com/v1", "new-model", "", 512, 0.8, 60));

        assertThat(existing.getApiKey()).isEqualTo("sk-old");
        assertThat(existing.getBaseUrl()).isEqualTo("https://new.example.com/v1");
        verify(mapper).updateById(existing);
    }

    @Test
    void effectiveFallsBackToEnvWithoutUserRow() {
        when(mapper.selectById(1L)).thenReturn(null);

        assertThat(service.effective(1L).source()).isEqualTo("ENV");
        assertThat(service.effective(1L).usable()).isTrue();
    }

    @Test
    void resetDeletesUserRow() {
        service.reset(1L);
        verify(mapper).deleteById(1L);
    }

    @Test
    void nonHttpBaseUrlIsRejected() {
        when(mapper.selectById(1L)).thenReturn(null);

        assertThatThrownBy(() -> service.save(1L,
                new LlmSettingsRequest(true, "file:///tmp/x", "model", "key", 512, 0.8, 60)))
                .hasMessageContaining("http");
    }
}
