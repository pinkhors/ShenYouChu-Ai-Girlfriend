package com.shenyouchu.core.voice.provider;

/** 提供给前端的 provider 元数据 + 当前用户凭据状态。 */
public record VoiceProviderView(
        VoiceProviderDescriptor descriptor,
        VoiceCredentialView credential
) {
}
