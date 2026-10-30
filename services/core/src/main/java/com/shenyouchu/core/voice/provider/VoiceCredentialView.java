package com.shenyouchu.core.voice.provider;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** 凭据视图：只返回非 secret 字段与 secret 是否已配置。 */
public record VoiceCredentialView(
        String providerId,
        boolean configured,
        String status,
        Instant lastVerifiedAt,
        Map<String, String> values,
        List<String> configuredSecrets
) {
}
