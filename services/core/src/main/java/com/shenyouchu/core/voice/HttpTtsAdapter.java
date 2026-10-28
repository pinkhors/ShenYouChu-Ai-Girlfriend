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
 * HTTP TTS 适配器：调用外部语音合成服务（CosyVoice 包装服务均可）。
 *
 * 约定请求：POST {base-url}，JSON { text, emotion }
 * 约定响应：JSON { audioBase64, format }
 * 任何异常都回退到 {@link StubTtsAdapter}（返回 none 格式），前端会退化为纯文本展示。
 */
@Component
@ConditionalOnProperty(name = "shenyouchu.voice.enabled", havingValue = "true")
public class HttpTtsAdapter implements TtsAdapter {

    private static final Logger log = LoggerFactory.getLogger(HttpTtsAdapter.class);

    private final StubTtsAdapter fallback;
    private final RestClient restClient;
    private final boolean configured;

    public HttpTtsAdapter(StubTtsAdapter fallback,
                          @Value("${shenyouchu.voice.tts-url:}") String ttsUrl,
                          @Value("${shenyouchu.voice.timeout-seconds:30}") int timeoutSeconds) {
        this.fallback = fallback;
        this.configured = ttsUrl != null && !ttsUrl.isBlank();

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(Math.min(Math.max(timeoutSeconds, 1), 10)));
        factory.setReadTimeout(Duration.ofSeconds(Math.max(timeoutSeconds, 1)));
        this.restClient = RestClient.builder()
                .baseUrl(ttsUrl == null ? "" : ttsUrl)
                .requestFactory(factory)
                .build();
    }

    @Override
    public TtsResult synthesize(String text, String emotion) {
        if (!configured || text == null || text.isBlank()) {
            return fallback.synthesize(text, emotion);
        }
        try {
            JsonNode response = restClient.post()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("text", text, "emotion", emotion == null ? "neutral" : emotion))
                    .retrieve()
                    .body(JsonNode.class);
            String audioBase64 = response == null ? null : response.path("audioBase64").asText(null);
            if (audioBase64 == null || audioBase64.isBlank()) {
                return fallback.synthesize(text, emotion);
            }
            String format = response.path("format").asText("mp3");
            return new TtsResult(Base64.getDecoder().decode(audioBase64), format);
        } catch (Exception ex) {
            log.warn("TTS service call failed, falling back to stub: {}", ex.getMessage());
            return fallback.synthesize(text, emotion);
        }
    }
}
