package com.shenyouchu.core.voice.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.shenyouchu.core.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Breeze TTS 2 适配器（原生协议，不是 OpenAI 格式）：
 * - 鉴权 xi-api-key
 * - POST /v1/text-to-speech/{voice_id}?output_format=mp3_24000_128
 * - SING/HUM 通过 [唱歌]/[哼歌] 标签表达
 */
@Component
public class BreezeVoiceProvider implements VoiceProvider {

    private static final Logger log = LoggerFactory.getLogger(BreezeVoiceProvider.class);

    private final RestClient restClient;
    private final boolean enabled;
    private final int maxTextChars;

    public BreezeVoiceProvider(
            @Value("${shenyouchu.voice.breeze.base-url:https://api.breeze.blue}") String baseUrl,
            @Value("${shenyouchu.voice.breeze.enabled:false}") boolean enabled,
            @Value("${shenyouchu.voice.breeze.max-text-chars:300}") int maxTextChars,
            @Value("${shenyouchu.voice.timeout-seconds:30}") int timeoutSeconds) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(Math.min(Math.max(timeoutSeconds, 1), 10)));
        factory.setReadTimeout(Duration.ofSeconds(Math.max(timeoutSeconds, 1)));
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl == null || baseUrl.isBlank() ? "https://api.breeze.blue" : baseUrl)
                .requestFactory(factory)
                .build();
        this.enabled = enabled;
        this.maxTextChars = Math.max(20, maxTextChars);
    }

    @Override
    public VoiceProviderDescriptor descriptor() {
        List<VoiceFieldSchema> credentialFields = List.of(
                new VoiceFieldSchema("apiKey", "Breeze API Key", VoiceFieldType.PASSWORD,
                        true, true, "xi-api-key", null,
                        "只保存在服务端，接口不回显。", 512, null)
        );
        List<VoiceFieldSchema> generationFields = List.of(
                new VoiceFieldSchema("voiceId", "音色 ID", VoiceFieldType.TEXT,
                        true, false, "voc_...", null,
                        "Breeze 声音克隆返回的 voice_id。", 128, null),
                new VoiceFieldSchema("language", "语言", VoiceFieldType.SELECT,
                        true, false, null,
                        List.of(new VoiceFieldOption("zh", "中文"), new VoiceFieldOption("en", "English")),
                        null, 8, "zh"),
                new VoiceFieldSchema("style", "风格", VoiceFieldType.SELECT,
                        true, false, null,
                        List.of(
                                new VoiceFieldOption("gentle", "温柔"),
                                new VoiceFieldOption("playful", "俏皮"),
                                new VoiceFieldOption("sad", "伤感"),
                                new VoiceFieldOption("excited", "激昂")),
                        "映射成 Breeze instructions。", 16, "gentle")
        );
        Map<VoiceCapability, List<VoiceFieldSchema>> byCapability = new LinkedHashMap<>();
        byCapability.put(VoiceCapability.SPEAK, generationFields);
        byCapability.put(VoiceCapability.SING, generationFields);
        byCapability.put(VoiceCapability.HUM, generationFields);
        return new VoiceProviderDescriptor(
                "breeze",
                "Breeze TTS 2",
                "短唱句/哼唱/表演；也可用于短说话。后台开关默认关闭。",
                Set.of(VoiceCapability.SPEAK, VoiceCapability.SING, VoiceCapability.HUM),
                credentialFields,
                byCapability,
                List.of("zh", "en"),
                maxTextChars,
                enabled
        );
    }

    @Override
    public VoiceProviderValidation validate(Map<String, String> credential) {
        String apiKey = credential.get("apiKey");
        if (apiKey == null || apiKey.isBlank()) {
            return VoiceProviderValidation.fail("请填写 Breeze API Key");
        }
        try {
            restClient.get()
                    .uri("/v1/models")
                    .header("xi-api-key", apiKey)
                    .retrieve()
                    .body(JsonNode.class);
            return VoiceProviderValidation.ok();
        } catch (Exception ex) {
            log.warn("Breeze credential validation failed: {}", safeMessage(ex));
            return VoiceProviderValidation.fail("Breeze Key 无效或无权限");
        }
    }

    @Override
    public VoiceSynthesisResult synthesize(VoiceSynthesisCommand command, Map<String, String> credential) {
        String apiKey = credential.get("apiKey");
        if (apiKey == null || apiKey.isBlank()) {
            throw ApiException.badRequest("VOICE_CREDENTIAL_MISSING", "请先配置 Breeze API Key");
        }
        String voiceId = param(command, "voiceId");
        if (voiceId == null) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "请选择 Breeze 音色");
        }
        String text = command.text() == null ? "" : command.text().trim();
        if (text.isEmpty()) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "文本不能为空");
        }
        if (text.length() > maxTextChars) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "文本超过 Breeze 上限 " + maxTextChars + " 字");
        }

        String bodyText = text;
        if (command.capability() == VoiceCapability.SING) {
            bodyText = "[唱歌] " + text;
        } else if (command.capability() == VoiceCapability.HUM) {
            bodyText = "[哼歌] " + text;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", bodyText);
        body.put("model_id", "breeze-tts-2");
        body.put("language_code", defaultIfBlank(param(command, "language"), "zh"));
        body.put("instructions", styleInstruction(param(command, "style")));
        body.put("voice_settings", Map.of("guidance_scale", 4.0));

        try {
            byte[] audio = restClient.post()
                    .uri("/v1/text-to-speech/{voiceId}?output_format=mp3_24000_128", voiceId)
                    .header("xi-api-key", apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(byte[].class);
            if (audio == null || audio.length == 0) {
                throw new IllegalStateException("empty audio");
            }
            return new VoiceSynthesisResult(audio, "mp3", null);
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("Breeze synthesis failed: {}", safeMessage(ex));
            throw new ApiException("VOICE_PROVIDER_UNAVAILABLE", HttpStatus.BAD_GATEWAY, "Breeze 语音合成失败");
        }
    }

    private static String styleInstruction(String style) {
        return switch (style == null ? "gentle" : style) {
            case "playful" -> "轻快俏皮，带一点笑意，节奏灵动。";
            case "sad" -> "伤感、克制，气息偏轻，尾音放慢。";
            case "excited" -> "明亮、有能量，情绪饱满。";
            default -> "温柔、轻声，像在耳边说话。";
        };
    }

    private static String param(VoiceSynthesisCommand command, String key) {
        String value = command.params() == null ? null : command.params().get(key);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String defaultIfBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String safeMessage(Exception ex) {
        String message = ex.getMessage();
        return message == null ? ex.getClass().getSimpleName() : message.substring(0, Math.min(160, message.length()));
    }
}
