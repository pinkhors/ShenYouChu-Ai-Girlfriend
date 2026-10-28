package com.shenyouchu.core.turn;

import org.springframework.stereotype.Component;

/**
 * M1 占位实现：不调用外部模型，按人设做简短确定性回应。
 * 目的是让消息、轮次、活动事件链路可端到端验证；LLM 接入时替换此实现即可。
 */
@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "shenyouchu.llm.enabled", havingValue = "false", matchIfMissing = true)
public class SimplePersonaReplyGenerator implements ReplyGenerator {

    @Override
    public String generate(String systemPrompt, String userText) {
        String trimmed = userText == null ? "" : userText.trim();
        if (trimmed.isEmpty()) {
            return "我在呢，你说。";
        }
        String preview = trimmed.length() > 30 ? trimmed.substring(0, 30) + "…" : trimmed;
        return "嗯，我在听。你说“" + preview + "”，我记下了。慢慢跟我讲，好吗？";
    }
}
