package com.shenyouchu.core.llm.settings;

import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.llm.EffectiveLlmConfig;
import com.shenyouchu.core.llm.LlmDefaults;
import com.shenyouchu.core.llm.LlmHttpClient;
import com.shenyouchu.core.llm.settings.dto.LlmSettingsRequest;
import com.shenyouchu.core.llm.settings.dto.LlmSettingsView;
import com.shenyouchu.core.llm.settings.dto.LlmTestResult;
import com.shenyouchu.core.llm.settings.mapper.UserLlmSettingsMapper;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * 用户级 LLM 配置：读取、保存、重置与连通性测试。
 *
 * 优先级：用户自己的配置（USER）→ 服务端环境变量（ENV）→ 确定性占位回复。
 * 用户显式保存了配置（即使 enabled=false）后，就不再使用环境变量，避免“改了不生效”的困惑。
 */
@Service
public class UserLlmSettingsService {

    private static final int DEFAULT_MAX_TOKENS = 512;
    private static final double DEFAULT_TEMPERATURE = 0.8;
    private static final int DEFAULT_TIMEOUT_SECONDS = 60;

    private final UserLlmSettingsMapper mapper;
    private final LlmDefaults defaults;
    private final LlmHttpClient httpClient;

    public UserLlmSettingsService(UserLlmSettingsMapper mapper,
                                  LlmDefaults defaults,
                                  LlmHttpClient httpClient) {
        this.mapper = mapper;
        this.defaults = defaults;
        this.httpClient = httpClient;
    }

    /** 生成回复时使用的有效配置；没有用户配置就回退到环境变量。 */
    public EffectiveLlmConfig effective(Long userId) {
        if (userId == null) {
            return defaults.config();
        }
        UserLlmSettings row = mapper.selectById(userId);
        if (row == null) {
            return defaults.config();
        }
        return new EffectiveLlmConfig(
                row.isEnabled(),
                trimToNull(row.getBaseUrl()),
                row.getApiKey(),
                trimToNull(row.getModel()),
                row.getMaxTokens(),
                row.getTemperature(),
                row.getTimeoutSeconds(),
                "USER");
    }

    /** 设置页展示用：不返回 Key 明文。 */
    public LlmSettingsView view(Long userId) {
        UserLlmSettings row = mapper.selectById(userId);
        if (row != null) {
            return new LlmSettingsView(
                    row.isEnabled(),
                    nullToEmpty(row.getBaseUrl()),
                    nullToEmpty(row.getModel()),
                    hasText(row.getApiKey()),
                    row.getMaxTokens(),
                    row.getTemperature(),
                    row.getTimeoutSeconds(),
                    "USER",
                    row.getUpdatedAt());
        }

        EffectiveLlmConfig env = defaults.config();
        return new LlmSettingsView(
                env.enabled(),
                nullToEmpty(env.baseUrl()),
                nullToEmpty(env.model()),
                hasText(env.apiKey()),
                env.maxTokens(),
                env.temperature(),
                env.timeoutSeconds(),
                env.usable() ? "ENV" : "NONE",
                null);
    }

    public LlmSettingsView save(Long userId, LlmSettingsRequest request) {
        String baseUrl = normalizeBaseUrl(request.baseUrl(), request.enabled());
        String model = trimToNull(request.model());
        if (request.enabled() && model == null) {
            throw ApiException.validation("启用模型时必须填写模型名");
        }

        UserLlmSettings existing = mapper.selectById(userId);
        boolean create = existing == null;
        /* 首次把 ENV 兜底切到用户配置时，不允许静默丢失 ENV 的 Key（前端也有同样拦截） */
        if (create && request.enabled() && !hasText(request.apiKey())) {
            EffectiveLlmConfig env = defaults.config();
            if (env.usable() && hasText(env.apiKey())) {
                throw ApiException.validation("首次保存用户配置时请填写 API Key（服务端默认 Key 不会复制）");
            }
        }
        UserLlmSettings row = create ? new UserLlmSettings(userId) : existing;

        row.setEnabled(request.enabled());
        /* 空值写成空串：updateById 默认忽略 null，否则关闭配置时旧 URL/模型会残留 */
        row.setBaseUrl(baseUrl == null ? "" : baseUrl);
        row.setModel(model == null ? "" : model);
        if (request.apiKey() != null && !request.apiKey().isBlank()) {
            row.setApiKey(request.apiKey().trim());
        }
        row.setMaxTokens(request.maxTokens() == null
                ? (existing == null ? DEFAULT_MAX_TOKENS : existing.getMaxTokens())
                : request.maxTokens());
        row.setTemperature(request.temperature() == null
                ? (existing == null ? DEFAULT_TEMPERATURE : existing.getTemperature())
                : request.temperature());
        row.setTimeoutSeconds(request.timeoutSeconds() == null
                ? (existing == null ? DEFAULT_TIMEOUT_SECONDS : existing.getTimeoutSeconds())
                : request.timeoutSeconds());

        if (create) {
            mapper.insert(row);
        } else {
            mapper.updateById(row);
        }
        return view(userId);
    }

    /** 删除用户配置，回退到环境变量默认值。 */
    public void reset(Long userId) {
        mapper.deleteById(userId);
    }

    /** 用当前有效配置发一条最小请求；失败也返回 200，由前端展示原因。 */
    public LlmTestResult test(Long userId) {
        EffectiveLlmConfig config = effective(userId);
        if (!config.usable()) {
            throw ApiException.validation("先启用并填写 Base URL、模型后再测试");
        }

        long startedAt = System.nanoTime();
        try {
            httpClient.complete(config, "你是一个简洁的助手。", "只回复：连接成功",
                    Math.min(config.maxTokens(), 32));
            long latencyMs = (System.nanoTime() - startedAt) / 1_000_000;
            return new LlmTestResult(true, latencyMs, config.model(), null);
        } catch (Exception ex) {
            long latencyMs = (System.nanoTime() - startedAt) / 1_000_000;
            return new LlmTestResult(false, latencyMs, config.model(), friendlyError(ex));
        }
    }

    private static String normalizeBaseUrl(String raw, boolean enabled) {
        String value = trimToNull(raw);
        if (value == null) {
            if (enabled) {
                throw ApiException.validation("启用模型时必须填写 Base URL");
            }
            return null;
        }
        try {
            if (value.contains("{") || value.contains("}")) {
                throw ApiException.validation("Base URL 不能包含 {}");
            }
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))
                    || uri.getHost() == null) {
                throw ApiException.validation("Base URL 只支持 http/https");
            }
            if (uri.getRawQuery() != null || uri.getRawFragment() != null) {
                throw ApiException.validation("Base URL 不能带 query 或 fragment");
            }
        } catch (URISyntaxException ex) {
            throw ApiException.validation("Base URL 格式不正确");
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private static String friendlyError(Exception ex) {
        String message = ex.getMessage() == null ? "模型调用失败" : ex.getMessage();
        if (message.length() > 300) {
            message = message.substring(0, 300) + "…";
        }
        return message;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
