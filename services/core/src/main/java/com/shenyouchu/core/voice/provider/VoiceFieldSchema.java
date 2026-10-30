package com.shenyouchu.core.voice.provider;

import java.util.List;

/** 配置驱动表单的字段描述；前端只按此渲染，不感知具体厂商。 */
public record VoiceFieldSchema(
        String key,
        String label,
        VoiceFieldType type,
        boolean required,
        boolean secret,
        String placeholder,
        List<VoiceFieldOption> options,
        String help,
        Integer maxLength,
        String defaultValue
) {
}
