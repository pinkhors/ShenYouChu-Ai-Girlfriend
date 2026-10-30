package com.shenyouchu.core.voice.provider;

import java.util.Map;

/** 保存凭据的请求；字段由 provider 的 credentialFields 决定。 */
public record VoiceCredentialRequest(Map<String, String> fields) {
}
