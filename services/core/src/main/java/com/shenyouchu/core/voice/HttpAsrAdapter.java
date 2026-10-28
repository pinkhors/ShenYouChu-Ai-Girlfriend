package com.shenyouchu.core.voice;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Base64;
import java.util.Map;

/**
 * HTTP ASR 适配器：调用外部语音识别服务（FunASR/Paraformer 包装服务均可）。
 *
 * 约定请求：POST {base-url}，JSON { audioBase64, contentType }
 * 约定响应：JSON { text, confidence }
 * 任何异常都回退到 {@link StubAsrAdapter}，保证语音链路不会因模型服务不可用而中断。
 */
@Component
@ConditionalOnProperty(name = "shenyouchu.voice.enabled", havingValue = "true")
public class HttpAsrAdapter implements AsrAdapter {

    private static final Logger log = LoggerFactory.getLogger(HttpAsrAdapter.class);

    private final StubAsrAdapter fallback;
    private final RestClient restClient;
    private final boolean configured;

    public HttpAsrAdapter(StubAsrAdapter fallback,
                          @Value("${shenyouchu.voice.asr-url:}") String asrUrl,
                          @Value("${shenyouchu.voice.timeout-seconds:30}") int timeoutSeconds) {
        this.fallback = fallback;
        this.configured = asrUrl != null && !asrUrl.isBlank();

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(Math.min(Math.max(timeoutSeconds, 1), 10)));
        factory.setReadTimeout(Duration.ofSeconds(Math.max(timeoutSeconds, 1)));
        this.restClient = RestClient.builder()
                .baseUrl(asrUrl == null ? "" : asrUrl)
                .requestFactory(factory)
                .build();
    }

    @Override
    public AsrResult transcribe(byte[] audio, String contentType) {
        if (!configured || audio == null || audio.length == 0) {
            return fallback.transcribe(audio, contentType);
        }
        try {
            JsonNode response = restClient.post()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "audioBase64", Base64.getEncoder().encodeToString(audio),
                            "contentType", contentType == null ? "audio/wav" : contentType))
                    .retrieve()
                    .body(JsonNode.class);
            String text = response == null ? null : response.path("text").asText(null);
            if (text == null || text.isBlank()) {
                return fallback.transcribe(audio, contentType);
            }
            double confidence = response.path("confidence").asDouble(1.0);
            return new AsrResult(text.trim(), confidence);
        } catch (Exception ex) {
            log.warn("ASR service call failed, falling back to stub: {}", ex.getMessage());
            return fallback.transcribe(audio, contentType);
        }
    }
}
