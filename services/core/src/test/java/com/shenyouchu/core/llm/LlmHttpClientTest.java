package com.shenyouchu.core.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class LlmHttpClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @SuppressWarnings("unchecked")
    void bodyContainsModelSystemAndUserMessages() {
        Map<String, Object> body = LlmHttpClient.buildBody("test-model", "SYSTEM", "USER", 128, 0.5);

        assertThat(body).containsEntry("model", "test-model");
        assertThat(body).containsEntry("max_tokens", 128);
        assertThat(body).containsEntry("temperature", 0.5);

        List<Map<String, String>> messages = (List<Map<String, String>>) body.get("messages");
        assertThat(messages).hasSize(2);
        assertThat(messages.get(0)).containsEntry("role", "system").containsEntry("content", "SYSTEM");
        assertThat(messages.get(1)).containsEntry("role", "user").containsEntry("content", "USER");
    }

    @Test
    @SuppressWarnings("unchecked")
    void bodyWithContextAddsIndependentSystemMessageBeforeUser() {
        Map<String, Object> body = LlmHttpClient.buildBody(
                "test-model", "SYSTEM", "CONTEXT", "USER", 256, 0.7);

        assertThat(body).containsEntry("temperature", 0.7);
        List<Map<String, String>> messages = (List<Map<String, String>>) body.get("messages");
        assertThat(messages).hasSize(3);
        assertThat(messages.get(0)).containsEntry("role", "system").containsEntry("content", "SYSTEM");
        assertThat(messages.get(1)).containsEntry("role", "system").containsEntry("content", "CONTEXT");
        assertThat(messages.get(2)).containsEntry("role", "user").containsEntry("content", "USER");
    }

    @Test
    @SuppressWarnings("unchecked")
    void blankContextKeepsLegacySystemAndUserMessages() {
        Map<String, Object> body = LlmHttpClient.buildBody(
                "test-model", "SYSTEM", "   ", "USER", 128, 0.5);

        List<Map<String, String>> messages = (List<Map<String, String>>) body.get("messages");
        assertThat(messages).hasSize(2);
        assertThat(messages.get(0)).containsEntry("role", "system").containsEntry("content", "SYSTEM");
        assertThat(messages.get(1)).containsEntry("role", "user").containsEntry("content", "USER");
    }

    @Test
    void textOfHandlesStringAndMultimodalArray() throws Exception {
        JsonNode stringNode = objectMapper.readTree("\"连接成功\"");
        JsonNode arrayNode = objectMapper.readTree("[{\"type\":\"text\",\"text\":\"连接\"},{\"type\":\"text\",\"text\":\"成功\"}]");

        assertThat(LlmHttpClient.textOf(stringNode)).isEqualTo("连接成功");
        assertThat(LlmHttpClient.textOf(arrayNode)).isEqualTo("连接成功");
        assertThat(LlmHttpClient.textOf(null)).isEmpty();
        assertThat(LlmHttpClient.textOf(objectMapper.readTree("null"))).isEmpty();
    }
}
