package com.shenyouchu.core.llm;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * OpenAI 兼容的 /chat/completions 调用。
 *
 * 每次调用按传入的有效配置创建客户端，因此不同用户可以使用不同 Base URL / Key / 超时；
 * 任何异常、空回复都由上层回退到确定性回复。
 */
@Component
public class LlmHttpClient {

    public String complete(EffectiveLlmConfig config, String systemPrompt, String userText) {
        return complete(config, systemPrompt, userText, config.maxTokens());
    }

    public String complete(EffectiveLlmConfig config, String systemPrompt, String userText, int maxTokens) {
        if (!config.usable()) {
            throw new IllegalStateException("LLM 未启用或缺少 Base URL/模型");
        }

        int timeoutSeconds = Math.max(config.timeoutSeconds(), 1);
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(Math.min(timeoutSeconds, 10)));
        factory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));

        RestClient client = RestClient.builder().requestFactory(factory).build();
        RestClient.RequestBodySpec request = client.post()
                .uri(trimTrailingSlash(config.baseUrl()) + "/chat/completions")
                .contentType(MediaType.APPLICATION_JSON);
        if (config.apiKey() != null && !config.apiKey().isBlank()) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + config.apiKey());
        }

        JsonNode response = request
                .body(buildBody(config.model(), systemPrompt, userText, maxTokens, config.temperature()))
                .retrieve()
                .body(JsonNode.class);

        if (response == null) {
            throw new IllegalStateException("LLM 返回了空响应");
        }
        JsonNode error = response.path("error");
        if (!error.isMissingNode() && !error.isNull()) {
            String message = error.path("message").asText("");
            throw new IllegalStateException("LLM 返回错误：" + (message.isBlank() ? snippet(response) : message));
        }
        JsonNode choices = response.path("choices");
        if (!choices.isArray() || choices.isEmpty()) {
            throw new IllegalStateException("LLM 响应缺少 choices：" + snippet(response));
        }
        JsonNode choice = choices.get(0);
        JsonNode message = choice.path("message");
        String content = textOf(message.get("content"));
        if (content.isBlank()) {
            JsonNode reasoning = message.has("reasoning") ? message.get("reasoning") : message.get("reasoning_content");
            String detail = "LLM 返回了空内容（finish_reason="
                    + choice.path("finish_reason").asText("unknown")
                    + "，reasoning=" + textOf(reasoning).length() + " chars）："
                    + snippet(response);
            throw new IllegalStateException(detail);
        }
        return content.trim();
    }

    /**
     * 兼容字符串、数组（多模态 text parts）与缺失字段。
     */
    static String textOf(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        if (node.isTextual()) {
            return node.asText();
        }
        if (node.isArray()) {
            StringBuilder builder = new StringBuilder();
            for (JsonNode item : node) {
                if (item.isTextual()) {
                    builder.append(item.asText());
                } else if (item.has("text")) {
                    builder.append(item.path("text").asText(""));
                }
            }
            return builder.toString();
        }
        return node.asText("");
    }

    private static String snippet(JsonNode response) {
        String text = response.toString();
        return text.length() > 300 ? text.substring(0, 300) + "…" : text;
    }

    /** 请求体保持最小字段，便于测试与不同供应商兼容。 */
    public static Map<String, Object> buildBody(String model, String systemPrompt, String userText,
                                                int maxTokens, double temperature) {
        return Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userText)),
                "max_tokens", maxTokens,
                "temperature", temperature);
    }

    private static String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
