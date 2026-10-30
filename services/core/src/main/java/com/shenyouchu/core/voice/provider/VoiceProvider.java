package com.shenyouchu.core.voice.provider;

import java.util.Map;

/**
 * 语音 Provider 端口。实现只负责厂商协议、凭据校验与合成，不承担产品策略/权限。
 * 当前先实现同步合成；流式/异步能力由上层 service 组合。
 */
public interface VoiceProvider {

    VoiceProviderDescriptor descriptor();

    VoiceProviderValidation validate(Map<String, String> credential);

    VoiceSynthesisResult synthesize(VoiceSynthesisCommand command, Map<String, String> credential);
}
