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
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 百炼 CosyVoice-v3-Flash 适配器（DashScope 原生协议，不是 OpenAI 格式）。
 * 第一期实现同步 HTTP；实时 WebSocket 由后续 streaming 适配器补充。
 */
@Component
public class CosyVoiceVoiceProvider implements VoiceProvider {

    private static final Logger log = LoggerFactory.getLogger(CosyVoiceVoiceProvider.class);
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9-]{1,64}$");

    private final RestClient downloadClient;
    private final boolean enabled;
    private final int maxTextChars;
    private final int timeoutSeconds;

    public CosyVoiceVoiceProvider(
            @Value("${shenyouchu.voice.cosyvoice.enabled:true}") boolean enabled,
            @Value("${shenyouchu.voice.cosyvoice.max-text-chars:1000}") int maxTextChars,
            @Value("${shenyouchu.voice.timeout-seconds:30}") int timeoutSeconds) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(Math.min(Math.max(timeoutSeconds, 1), 10)));
        factory.setReadTimeout(Duration.ofSeconds(Math.max(timeoutSeconds, 1)));
        this.downloadClient = RestClient.builder().requestFactory(factory).build();
        this.enabled = enabled;
        this.maxTextChars = Math.max(20, maxTextChars);
        this.timeoutSeconds = Math.max(1, timeoutSeconds);
    }

    @Override
    public VoiceProviderDescriptor descriptor() {
        List<VoiceFieldSchema> credentialFields = List.of(
                new VoiceFieldSchema("apiKey", "百炼 API Key", VoiceFieldType.PASSWORD,
                        true, true, "sk-...", null,
                        "只保存在服务端，接口不回显。", 512, null),
                new VoiceFieldSchema("workspaceId", "Workspace ID", VoiceFieldType.TEXT,
                        true, false, "例如 ws_xxx", null,
                        "百炼业务空间 ID，用于拼接专属域名。", 64, null),
                new VoiceFieldSchema("region", "地域", VoiceFieldType.SELECT,
                        true, false, null,
                        List.of(
                                new VoiceFieldOption("cn-beijing", "华北2（北京）"),
                                new VoiceFieldOption("ap-southeast-1", "新加坡")),
                        null, 32, "cn-beijing")
        );
        List<VoiceFieldSchema> generationFields = List.of(
                new VoiceFieldSchema("voiceId", "音色 ID", VoiceFieldType.TEXT,
                        true, false, "longanyang / 复刻 voice_id", null,
                        "复刻音色必须与 cosyvoice-v3-flash 的 target_model 一致。", 128, "longanyang"),
                new VoiceFieldSchema("instruction", "表达指令", VoiceFieldType.TEXTAREA,
                        false, false, "温柔、轻声，像在耳边说话。", null,
                        "CosyVoice 指令最长约 100 字符。", 100, null),
                new VoiceFieldSchema("language", "语言", VoiceFieldType.SELECT,
                        true, false, null,
                        List.of(new VoiceFieldOption("zh", "中文"), new VoiceFieldOption("en", "English")),
                        null, 8, "zh")
        );
        return new VoiceProviderDescriptor(
                "cosyvoice",
                "CosyVoice-v3-Flash",
                "说话/语音消息；支持声音复刻与低延迟合成。",
                Set.of(VoiceCapability.SPEAK),
                credentialFields,
                Map.of(VoiceCapability.SPEAK, generationFields),
                List.of("zh", "en"),
                maxTextChars,
                enabled
        );
    }

    @Override
    public VoiceProviderValidation validate(Map<String, String> credential) {
        String apiKey = credential.get("apiKey");
        String workspaceId = credential.get("workspaceId");
        String region = credential.get("region");
        if (apiKey == null || apiKey.isBlank()) {
            return VoiceProviderValidation.fail("请填写百炼 API Key");
        }
        if (!safeId(workspaceId) || !safeId(region)) {
            return VoiceProviderValidation.fail("Workspace ID 或地域不合法");
        }
        try {
            synthesize(new VoiceSynthesisCommand(VoiceCapability.SPEAK, "你好", Map.of(), "mp3"), credential);
            return VoiceProviderValidation.ok();
        } catch (Exception ex) {
            log.warn("CosyVoice credential validation failed: {}", safeMessage(ex));
            return VoiceProviderValidation.fail("百炼 Key/Workspace 无效，或模型未授权");
        }
    }

    @Override
    public VoiceSynthesisResult synthesize(VoiceSynthesisCommand command, Map<String, String> credential) {
        String apiKey = credential.get("apiKey");
        String workspaceId = credential.get("workspaceId");
        String region = credential.get("region");
        if (apiKey == null || apiKey.isBlank()) {
            throw ApiException.badRequest("VOICE_CREDENTIAL_MISSING", "请先配置百炼 API Key");
        }
        if (!safeId(workspaceId) || !safeId(region)) {
            throw ApiException.badRequest("VOICE_CREDENTIAL_INVALID", "Workspace ID 或地域不合法");
        }
        String text = command.text() == null ? "" : command.text().trim();
        if (text.isEmpty()) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "文本不能为空");
        }
        if (text.length() > maxTextChars) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "文本超过 CosyVoice 上限 " + maxTextChars + " 字");
        }

        String voice = param(command, "voiceId");
        if (voice == null) {
            voice = "longanyang";
        }
        String instruction = param(command, "instruction");
        String language = param(command, "language");

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("text", text);
        input.put("voice", voice);
        input.put("format", "mp3");
        input.put("sample_rate", 24000);
        if (instruction != null) {
            input.put("instruction", instruction);
        }
        if (language != null) {
            input.put("language_hints", List.of(language));
        }
        Map<String, Object> body = Map.of("model", "cosyvoice-v3-flash", "input", input);

        String baseUrl = "https://" + workspaceId + "." + region + ".maas.aliyuncs.com";
        try {
            JsonNode response = client(baseUrl).post()
                    .uri("/api/v1/services/audio/tts/SpeechSynthesizer")
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            if (response == null) {
                throw new IllegalStateException("empty response");
            }
            String data = response.path("output").path("audio").path("data").asText("");
            if (!data.isBlank()) {
                return new VoiceSynthesisResult(
                        Base64.getDecoder().decode(data),
                        "mp3",
                        response.path("request_id").asText(null));
            }
            String url = response.path("output").path("audio").path("url").asText("");
            if (!url.isBlank()) {
                byte[] audio = downloadClient.get().uri(url).retrieve().body(byte[].class);
                if (audio == null || audio.length == 0) {
                    throw new IllegalStateException("empty download");
                }
                return new VoiceSynthesisResult(audio, "mp3", response.path("request_id").asText(null));
            }
            throw new IllegalStateException("audio missing");
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("CosyVoice synthesis failed: {}", safeMessage(ex));
            throw new ApiException("VOICE_PROVIDER_UNAVAILABLE", HttpStatus.BAD_GATEWAY, "CosyVoice 语音合成失败");
        }
    }

    private RestClient client(String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(Math.min(timeoutSeconds, 10)));
        factory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    private static boolean safeId(String value) {
        return value != null && SAFE_ID.matcher(value).matches();
    }

    private static String param(VoiceSynthesisCommand command, String key) {
        String value = command.params() == null ? null : command.params().get(key);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String safeMessage(Exception ex) {
        String message = ex.getMessage();
        return message == null ? ex.getClass().getSimpleName() : message.substring(0, Math.min(160, message.length()));
    }
}
