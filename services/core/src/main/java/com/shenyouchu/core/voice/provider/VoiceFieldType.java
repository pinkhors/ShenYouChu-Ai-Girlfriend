package com.shenyouchu.core.voice.provider;

/** 动态表单字段类型；前端只渲染这些受控类型，不执行配置中的代码。 */
public enum VoiceFieldType {
    TEXT,
    PASSWORD,
    SELECT,
    TEXTAREA,
    NUMBER,
    SWITCH
}
