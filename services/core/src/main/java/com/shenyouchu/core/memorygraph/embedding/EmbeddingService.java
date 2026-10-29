package com.shenyouchu.core.memorygraph.embedding;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * 向量化入口：优先 OpenAI 兼容 /embeddings，未配置或失败时回退离线哈希向量。
 *
 * <p>生产通过 `shenyouchu.memory.embedding.*` 打开；不把 key 写进任何日志。
 */
@Service
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    private final HashingEmbeddingClient fallback;
    private final ObjectMapper objectMapper;
    private final boolean enabled;
    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final int timeoutSeconds;

    public EmbeddingService(HashingEmbeddingClient fallback,
                            ObjectMapper objectMapper,
                            @Value("${shenyouchu.memory.embedding.enabled:false}") boolean enabled,
                            @Value("${shenyouchu.memory.embedding.base-url:}") String baseUrl,
                            @Value("${shenyouchu.memory.embedding.api-key:}") String apiKey,
                            @Value("${shenyouchu.memory.embedding.model:text-embedding-3-small}") String model,
                            @Value("${shenyouchu.memory.embedding.timeout-seconds:10}") int timeoutSeconds) {
        this.fallback = fallback;
        this.objectMapper = objectMapper;
        this.enabled = enabled;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.model = model;
        this.timeoutSeconds = timeoutSeconds;
    }

    public EmbeddingPort.Embedding embed(String text) {
        if (!enabled || baseUrl == null || baseUrl.isBlank()) {
            return fallback.embed(text);
        }
        try {
            return remote(text);
        } catch (RuntimeException ex) {
            log.warn("embedding 调用失败，回退离线向量：{}", ex.getMessage());
            return fallback.embed(text);
        }
    }

    private EmbeddingPort.Embedding remote(String text) {
        int timeout = Math.max(timeoutSeconds, 1);
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(Math.min(timeout, 5)));
        factory.setReadTimeout(Duration.ofSeconds(timeout));

        RestClient client = RestClient.builder().requestFactory(factory).build();
        RestClient.RequestBodySpec request = client.post()
                .uri(trimTrailingSlash(baseUrl) + "/embeddings")
                .contentType(MediaType.APPLICATION_JSON);
        if (apiKey != null && !apiKey.isBlank()) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey);
        }

        JsonNode response = request
                .body(Map.of("model", model, "input", text))
                .retrieve()
                .body(JsonNode.class);
        if (response == null) {
            throw new IllegalStateException("embedding 返回空响应");
        }
        JsonNode data = response.path("data");
        if (!data.isArray() || data.isEmpty()) {
            throw new IllegalStateException("embedding 响应缺少 data");
        }
        JsonNode embedding = data.get(0).path("embedding");
        if (!embedding.isArray() || embedding.isEmpty()) {
            throw new IllegalStateException("embedding 响应缺少向量");
        }
        float[] vector = new float[embedding.size()];
        for (int index = 0; index < embedding.size(); index++) {
            vector[index] = (float) embedding.get(index).asDouble();
        }
        normalize(vector);
        return new EmbeddingPort.Embedding(model, vector.length, vector);
    }

    public String toJson(float[] vector) {
        try {
            return objectMapper.writeValueAsString(vector);
        } catch (Exception ex) {
            throw new IllegalStateException("向量序列化失败", ex);
        }
    }

    public float[] fromJson(String json) {
        if (json == null || json.isBlank()) {
            return new float[0];
        }
        try {
            return objectMapper.readValue(json, float[].class);
        } catch (Exception ex) {
            return new float[0];
        }
    }

    private static void normalize(float[] vector) {
        double sum = 0;
        for (float value : vector) {
            sum += value * value;
        }
        double norm = Math.sqrt(sum);
        if (norm == 0) {
            return;
        }
        for (int index = 0; index < vector.length; index++) {
            vector[index] = (float) (vector[index] / norm);
        }
    }

    private static String trimTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    /** 测试与诊断用：当前是否走远端。 */
    public boolean remoteEnabled() {
        return enabled && baseUrl != null && !baseUrl.isBlank();
    }

    public List<String> modelInfo() {
        return List.of(model, String.valueOf(remoteEnabled()));
    }
}
