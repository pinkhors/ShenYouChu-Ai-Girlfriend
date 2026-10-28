package com.shenyouchu.core.turn;

/** 回复生成 seam：默认确定性实现，用户配置了 LLM 时走 OpenAI 兼容接口。 */
public interface ReplyGenerator {

    /**
     * @param userId 当前用户；实现可据此选择该用户自己的模型配置
     */
    String generate(Long userId, String systemPrompt, String userText);

    /** 兼容旧调用/测试；等价于 userId = null（使用服务端默认配置）。 */
    default String generate(String systemPrompt, String userText) {
        return generate(null, systemPrompt, userText);
    }
}
