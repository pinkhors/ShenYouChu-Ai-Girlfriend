package com.shenyouchu.core.message.dto;

import java.util.List;

/** 消息分页信封：cursor 为上一页最后一条消息 id（雪花 ID 字符串）。 */
public record MessagePage(List<MessageView> items, String nextCursor) {
}