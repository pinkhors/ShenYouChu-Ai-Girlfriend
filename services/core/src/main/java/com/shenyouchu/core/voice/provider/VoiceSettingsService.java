package com.shenyouchu.core.voice.provider;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.voice.provider.mapper.VoiceSettingsMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 用户级「通话默认声音」的读写与校验。 */
@Service
public class VoiceSettingsService {

    private final VoiceSettingsMapper mapper;
    private final VoiceProviderRegistry registry;
    private final VoiceCredentialService credentialService;
    private final ObjectMapper objectMapper;

    public VoiceSettingsService(VoiceSettingsMapper mapper,
                                VoiceProviderRegistry registry,
                                VoiceCredentialService credentialService,
                                ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.registry = registry;
        this.credentialService = credentialService;
        this.objectMapper = objectMapper;
    }

    public VoiceSettingsView get(Long userId) {
        VoiceSettings row = find(userId);
        if (row == null) {
            return new VoiceSettingsView(false, false, null, Map.of());
        }
        return new VoiceSettingsView(true, row.isEnabled(), row.getProviderId(), readParams(row));
    }

    public VoiceSettingsView save(Long userId, VoiceSettingsRequest request) {
        boolean enabled = request != null && request.enabled() != null ? request.enabled() : true;
        if (!enabled) {
            VoiceSettings row = find(userId);
            if (row == null) {
                return new VoiceSettingsView(false, false, null, Map.of());
            }
            row.setEnabled(false);
            mapper.updateById(row);
            return get(userId);
        }

        String providerId = request == null ? null : trimToNull(request.providerId());
        if (providerId == null) {
            throw ApiException.badRequest("VOICE_SETTINGS_INVALID", "请选择默认语音模型");
        }
        VoiceProvider provider = registry.require(providerId);
        VoiceProviderDescriptor descriptor = provider.descriptor();
        if (!descriptor.enabled()) {
            throw ApiException.badRequest("VOICE_PROVIDER_DISABLED", descriptor.displayName() + " 暂未开放");
        }
        if (!descriptor.capabilities().contains(VoiceCapability.SPEAK)) {
            throw ApiException.badRequest("VOICE_CAPABILITY_UNSUPPORTED", descriptor.displayName() + " 不支持说话");
        }

        Map<String, String> params = sanitize(descriptor, request == null ? null : request.params());
        requireFields(descriptor, params);
        /* 提前暴露未配置凭据，避免用户以为已保存成功。 */
        credentialService.resolve(userId, providerId);

        String json = writeParams(params);
        VoiceSettings row = find(userId);
        boolean create = row == null;
        if (create) {
            row = new VoiceSettings(userId);
        }
        row.setEnabled(true);
        row.setProviderId(providerId);
        row.setParamsJson(json);
        if (create) {
            mapper.insert(row);
        } else {
            mapper.updateById(row);
        }
        return get(userId);
    }

    /** 取有效默认声音；未配置/已停用时返回 400，由调用方决定是否回退。 */
    public VoiceSettingsView requireActive(Long userId) {
        VoiceSettingsView view = get(userId);
        if (!view.configured() || !view.enabled()) {
            throw ApiException.badRequest("VOICE_SETTINGS_MISSING", "请先在语音页设置通话默认声音");
        }
        return view;
    }

    private Map<String, String> sanitize(VoiceProviderDescriptor descriptor, Map<String, String> raw) {
        List<VoiceFieldSchema> fields = descriptor.generationFields()
                .getOrDefault(VoiceCapability.SPEAK, List.of());
        Map<String, String> params = new LinkedHashMap<>();
        if (raw != null) {
            for (VoiceFieldSchema field : fields) {
                String value = trimToNull(raw.get(field.key()));
                if (value != null) {
                    params.put(field.key(), value);
                }
            }
        }
        return params;
    }

    private void requireFields(VoiceProviderDescriptor descriptor, Map<String, String> params) {
        for (VoiceFieldSchema field : descriptor.generationFields()
                .getOrDefault(VoiceCapability.SPEAK, List.of())) {
            if (field.required() && trimToNull(params.get(field.key())) == null) {
                throw ApiException.badRequest("VOICE_SETTINGS_INVALID", "请填写" + field.label());
            }
        }
    }

    private VoiceSettings find(Long userId) {
        return mapper.selectOne(Wrappers.<VoiceSettings>lambdaQuery()
                .eq(VoiceSettings::getUserId, userId)
                .last("limit 1"));
    }

    private Map<String, String> readParams(VoiceSettings row) {
        try {
            return objectMapper.readValue(row.getParamsJson(), new TypeReference<Map<String, String>>() { });
        } catch (Exception ex) {
            throw new ApiException("VOICE_SETTINGS_INVALID", HttpStatus.INTERNAL_SERVER_ERROR,
                    "默认声音配置无法读取，请重新保存");
        }
    }

    private String writeParams(Map<String, String> params) {
        try {
            return objectMapper.writeValueAsString(params);
        } catch (Exception ex) {
            throw new ApiException("VOICE_SETTINGS_INVALID", HttpStatus.INTERNAL_SERVER_ERROR,
                    "默认声音保存失败");
        }
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
