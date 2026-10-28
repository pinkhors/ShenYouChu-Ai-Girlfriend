package com.shenyouchu.core.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.shenyouchu.core.turn.ReplyGenerator;
import com.shenyouchu.core.turn.SimplePersonaReplyGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * OpenAI 兼容的 LLM 适配器（DashScope compatible-mode、vLLM、Ollama 等均可）。
 * 任何异常、超时或空回复都回退到 {@link SimplePersonaReplyGenerator}，保证对话链路可用。
 */
@Component
@ConditionalOnProperty(name = "shenyouchu.llm.enabled", havingValue = "true")
public class HttpLlmReplyGenerator implements ReplyGenerator {

    private static final Logger log = LoggerFactory.getLogger(HttpLlmReplyGenerator.class);

    private final SimplePersonaReplyGenerator fallback;
    private final RestClient restClient;
    private final boolean configured;
    private final String model;
    private final int maxTokens;
    private final double temperature;

    public HttpLlmReplyGenerator(SimplePersonaReplyGenerator fallback,
                                 @Value("${shenyouchu.llm.base-url:}") String baseUrl,
                                 @Value("${shenyouchu.llm.api-key:}") String apiKey,
                                 @Value("${shenyouchu.llm.model:qwen3.7-plus}") String model,
                                 @Value("${shenyouchu.llm.timeout-seconds:30}") int timeoutSeconds,
                                 @Value("${shenyouchu.llm.max-tokens:256}") int maxTokens,
                                 @Value("${shenyouchu.llm.temperature:0.8}") double temperature) {
        this.fallback = fallback;
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.configured = baseUrl != null && !baseUrl.isBlank();

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(Math.min(Math.max(timeoutSeconds, 1), 10)));
        factory.setReadTimeout(Duration.ofSeconds(Math.max(timeoutSeconds, 1)));
        this.restClient = RestClient.builder()
                .baseUrl(trimTrailingSlash(baseUrl == null ? "" : baseUrl))
                .requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + (apiKey == null ? "" : apiKey))
                .build();
    }

    @Override
    public String generate(String systemPrompt, String userText) {
        if (!configured) {
            return fallback.generate(systemPrompt, userText);
        }
        try {
            JsonNode response = restClient.post()
                    .uri("/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(buildBody(model, systemPrompt, userText, maxTokens, temperature))
                    .retrieve()
                    .body(JsonNode.class);
            String content = response == null ? null
                    : response.path("choices").path(0).path("message").path("content").asText(null);
            if (content == null || content.isBlank()) {
                return fallback.generate(systemPrompt, userText);
            }
            return content.trim();
        } catch (Exception ex) {
            log.warn("LLM call failed, falling back to deterministic reply: {}", ex.getMessage());
            return fallback.generate(systemPrompt, userText);
        }
    }

    /** 请求体保持最小字段，便于测试与不同供应商兼容。 */
    static Map<String, Object> buildBody(String model, String systemPrompt, String userText,
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
