package com.shenyouchu.core.turn;

/** 回复生成 seam：默认确定性实现，用户配置了 LLM 时走 OpenAI 兼容接口。 */
public interface ReplyGenerator {

    /**
     * @param userId 当前用户；实现可据此选择该用户自己的模型配置
     */
    String generate(Long userId, String systemPrompt, String userText);

    /**
     * 带角色温度的生成入口（文档 09 §7）。
     *
     * <p>默认实现忽略角色与温度，转调旧方法，因此只实现旧方法的生成器无需改动；
     * 真实模型实现应把 {@code temperature} 作为采样参数。
     *
     * @param characterId 会话所属角色；用于日志/后续按角色分化，可为 null
     * @param temperature 角色级生效温度；{@link Double#NaN} 表示沿用用户级配置
     */
    default String generate(Long userId, Long characterId, String systemPrompt, String userText,
                            double temperature) {
        return generate(userId, systemPrompt, userText);
    }

    /**
     * 带独立上下文（最近对话 / 记忆 / 关系摘要）的生成入口（文档 09 §8.6）。
     *
     * <p>默认实现忽略上下文，转调 5 参方法，因此旧生成器无需改动；
     * 真实模型实现应把 {@code context} 作为独立的 system message 传递，
     * 而不是拼进用户本轮发言。
     *
     * @param context 组装好的上下文；空字符串表示不注入
     */
    default String generate(Long userId, Long characterId, String systemPrompt,
                            String context, String userText, double temperature) {
        return generate(userId, characterId, systemPrompt, userText, temperature);
    }

    /** 兼容旧调用/测试；等价于 userId = null（使用服务端默认配置）。 */
    default String generate(String systemPrompt, String userText) {
        return generate(null, systemPrompt, userText);
    }
}
