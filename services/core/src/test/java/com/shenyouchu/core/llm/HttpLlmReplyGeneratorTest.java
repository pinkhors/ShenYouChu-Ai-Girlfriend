package com.shenyouchu.core.llm;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class HttpLlmReplyGeneratorTest {

    @Test
    @SuppressWarnings("unchecked")
    void bodyContainsModelSystemAndUserMessages() {
        Map<String, Object> body = HttpLlmReplyGenerator.buildBody("test-model", "SYSTEM", "USER", 128, 0.5);

        assertThat(body).containsEntry("model", "test-model");
        assertThat(body).containsEntry("max_tokens", 128);
        assertThat(body).containsEntry("temperature", 0.5);

        List<Map<String, String>> messages = (List<Map<String, String>>) body.get("messages");
        assertThat(messages).hasSize(2);
        assertThat(messages.get(0)).containsEntry("role", "system").containsEntry("content", "SYSTEM");
        assertThat(messages.get(1)).containsEntry("role", "user").containsEntry("content", "USER");
    }
}
