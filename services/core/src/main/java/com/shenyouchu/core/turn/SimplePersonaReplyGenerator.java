package com.shenyouchu.core.turn;

import org.springframework.stereotype.Component;

/**
 * 确定性占位实现：不调用外部模型，按人设做简短回应。
 * 没有用户配置或 LLM 调用失败时使用，保证对话链路始终可用。
 */
@Component
public class SimplePersonaReplyGenerator implements ReplyGenerator {

    @Override
    public String generate(Long userId, String systemPrompt, String userText) {
        String trimmed = userText == null ? "" : userText.trim();
        if (trimmed.isEmpty()) {
            return "我在呢，你说。";
        }
        String preview = trimmed.length() > 30 ? trimmed.substring(0, 30) + "…" : trimmed;
        return "嗯，我在听。你说“" + preview + "”，我记下了。慢慢跟我讲，好吗？";
    }
}
