package com.shenyouchu.core.conversation.dto;

import java.util.List;

/** 会话分页信封：nextCursor 为上一页最后一条会话 id（雪花 ID 字符串）。 */
public record ConversationPage(List<ConversationView> items, String nextCursor) {
}