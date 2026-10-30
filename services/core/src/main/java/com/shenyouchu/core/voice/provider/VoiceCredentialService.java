package com.shenyouchu.core.voice.provider;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.common.ApiException;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 用户级语音凭据的保存、校验、读取与删除。 */
@Service
public class VoiceCredentialService {

    private final VoiceCredentialMapper mapper;
    private final VoiceProviderRegistry registry;
    private final VoiceCredentialCipher cipher;
    private final ObjectMapper objectMapper;

    public VoiceCredentialService(VoiceCredentialMapper mapper,
                                  VoiceProviderRegistry registry,
                                  VoiceCredentialCipher cipher,
                                  ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.registry = registry;
        this.cipher = cipher;
        this.objectMapper = objectMapper;
    }

    public List<VoiceProviderView> providers(Long userId) {
        List<VoiceProviderView> views = new ArrayList<>();
        for (VoiceProvider provider : registry.all()) {
            views.add(new VoiceProviderView(provider.descriptor(), view(userId, provider.descriptor().id())));
        }
        return views;
    }

    public VoiceCredentialView view(Long userId, String providerId) {
        VoiceCredential row = find(userId, providerId);
        if (row == null) {
            return new VoiceCredentialView(providerId, false, "unconfigured", null,
                    Map.of(), List.of());
        }
        VoiceProvider provider = registry.require(providerId);
        Map<String, String> payload = decrypt(row);
        Map<String, String> values = new LinkedHashMap<>();
        List<String> secrets = new ArrayList<>();
        for (VoiceFieldSchema field : provider.descriptor().credentialFields()) {
            String value = payload.get(field.key());
            if (field.secret()) {
                if (value != null && !value.isBlank()) {
                    secrets.add(field.key());
                }
            } else if (value != null) {
                values.put(field.key(), value);
            }
        }
        return new VoiceCredentialView(providerId, true, row.getStatus(), row.getLastVerifiedAt(),
                values, List.copyOf(secrets));
    }

    public VoiceCredentialView save(Long userId, String providerId, VoiceCredentialRequest request) {
        VoiceProvider provider = registry.require(providerId);
        Map<String, String> existing = existingPayload(userId, providerId);
        Map<String, String> merged = new LinkedHashMap<>(existing);
        Map<String, String> incoming = request == null || request.fields() == null
                ? Map.of() : request.fields();

        for (VoiceFieldSchema field : provider.descriptor().credentialFields()) {
            String value = trimToNull(incoming.get(field.key()));
            if (value != null) {
                merged.put(field.key(), value);
            } else if (field.defaultValue() != null && merged.get(field.key()) == null) {
                merged.put(field.key(), field.defaultValue());
            }
            if (field.required() && trimToNull(merged.get(field.key())) == null) {
                throw ApiException.badRequest("VOICE_CREDENTIAL_REQUIRED", "请填写 " + field.label());
            }
        }

        VoiceProviderValidation validation = provider.validate(merged);
        if (!validation.valid()) {
            throw new ApiException("VOICE_CREDENTIAL_INVALID", HttpStatus.BAD_REQUEST,
                    validation.message() == null ? "凭据校验失败" : validation.message());
        }

        VoiceCredential row = find(userId, providerId);
        boolean create = row == null;
        if (create) {
            row = new VoiceCredential(userId, providerId);
        }
        row.setEncryptedPayload(cipher.encrypt(writeJson(merged)));
        row.setStatus("active");
        row.setLastVerifiedAt(Instant.now());
        if (create) {
            mapper.insert(row);
        } else {
            mapper.updateById(row);
        }
        return view(userId, providerId);
    }

    public VoiceProviderValidation validate(Long userId, String providerId) {
        VoiceProvider provider = registry.require(providerId);
        Map<String, String> payload = resolve(userId, providerId);
        VoiceProviderValidation validation = provider.validate(payload);
        VoiceCredential row = find(userId, providerId);
        if (row != null) {
            row.setStatus(validation.valid() ? "active" : "invalid");
            row.setLastVerifiedAt(Instant.now());
            mapper.updateById(row);
        }
        return validation;
    }

    public Map<String, String> resolve(Long userId, String providerId) {
        VoiceCredential row = find(userId, providerId);
        if (row == null) {
            throw ApiException.badRequest("VOICE_CREDENTIAL_MISSING", "请先配置 " + providerId + " 的凭据");
        }
        return decrypt(row);
    }

    public void delete(Long userId, String providerId) {
        VoiceCredential row = find(userId, providerId);
        if (row != null) {
            mapper.deleteById(row.getId());
        }
    }

    private VoiceCredential find(Long userId, String providerId) {
        return mapper.selectOne(Wrappers.<VoiceCredential>lambdaQuery()
                .eq(VoiceCredential::getUserId, userId)
                .eq(VoiceCredential::getProviderId, providerId)
                .last("limit 1"));
    }

    private Map<String, String> existingPayload(Long userId, String providerId) {
        VoiceCredential row = find(userId, providerId);
        return row == null ? Map.of() : decrypt(row);
    }

    private Map<String, String> decrypt(VoiceCredential row) {
        try {
            return objectMapper.readValue(cipher.decrypt(row.getEncryptedPayload()),
                    new TypeReference<Map<String, String>>() { });
        } catch (Exception ex) {
            throw new ApiException("VOICE_CREDENTIAL_INVALID", HttpStatus.INTERNAL_SERVER_ERROR,
                    "语音凭据无法读取，请重新配置");
        }
    }

    private String writeJson(Map<String, String> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ex) {
            throw new ApiException("VOICE_CREDENTIAL_INVALID", HttpStatus.INTERNAL_SERVER_ERROR,
                    "语音凭据保存失败");
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
