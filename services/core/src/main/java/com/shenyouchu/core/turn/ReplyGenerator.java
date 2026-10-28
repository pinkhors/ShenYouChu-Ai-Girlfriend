package com.shenyouchu.core.turn;

/** 回复生成 seam：M1 用确定性实现，后续替换为 LLM 流式适配器。 */
public interface ReplyGenerator {

    String generate(String systemPrompt, String userText);
}
