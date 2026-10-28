package com.shenyouchu.core.message.dto;

import java.util.List;

/** 消息分页信封：items 按时间升序；cursor 为更早一页的最早消息 id（雪花 ID 字符串）。 */
public record MessagePage(List<MessageView> items, String nextCursor) {
}