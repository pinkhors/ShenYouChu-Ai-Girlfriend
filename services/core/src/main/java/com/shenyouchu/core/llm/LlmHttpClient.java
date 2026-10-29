package com.shenyouchu.core.llm;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
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
        return complete(config, systemPrompt, userText, config.maxTokens(), config.temperature());
    }

    public String complete(EffectiveLlmConfig config, String systemPrompt, String userText, int maxTokens) {
        return complete(config, systemPrompt, userText, maxTokens, config.temperature());
    }

    /**
     * 带独立上下文的三段式调用（文档 09 §8.6）：system → context → user。
     *
     * <p>context 为空时等价于旧方法，保持既有行为；context 非空时作为独立
     * system message 发送，绝不拼进用户本轮发言。
     */
    public String complete(EffectiveLlmConfig config, String systemPrompt, String context,
                           String userText, int maxTokens, double temperature) {
        if (context == null || context.isBlank()) {
            /* 走旧入口，保持既有子类覆写与降级路径不变 */
            return complete(config, systemPrompt, userText, maxTokens, temperature);
        }
        return execute(config, systemPrompt, context, userText, maxTokens, temperature);
    }

    /**
     * 带显式采样温度的实现（文档 09 §7）：temperature 由角色表达温度决定，
     * 而不是用户级配置；其余字段仍来自 {@code config}。
     */
    public String complete(EffectiveLlmConfig config, String systemPrompt, String userText,
                           int maxTokens, double temperature) {
        return execute(config, systemPrompt, null, userText, maxTokens, temperature);
    }

    private String execute(EffectiveLlmConfig config, String systemPrompt, String context,
                           String userText, int maxTokens, double temperature) {
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
                .body(buildBody(config.model(), systemPrompt, context, userText, maxTokens, temperature))
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
        return buildBody(model, systemPrompt, null, userText, maxTokens, temperature);
    }

    /**
     * 三段式请求体：system →（context 非空时）system → user。
     *
     * <p>顺序有语义：上下文必须独立成 system message，模型才不会把它当成
     * 用户刚说的话或新的指令。
     */
    public static Map<String, Object> buildBody(String model, String systemPrompt, String context,
                                                String userText, int maxTokens, double temperature) {
        List<Map<String, String>> messages = new ArrayList<>(3);
        messages.add(Map.of("role", "system", "content", systemPrompt));
        if (context != null && !context.isBlank()) {
            messages.add(Map.of("role", "system", "content", context));
        }
        messages.add(Map.of("role", "user", "content", userText));
        return Map.of(
                "model", model,
                "messages", List.copyOf(messages),
                "max_tokens", maxTokens,
                "temperature", temperature);
    }

    private static String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
