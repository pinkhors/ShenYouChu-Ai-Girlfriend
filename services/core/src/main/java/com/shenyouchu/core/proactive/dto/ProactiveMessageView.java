package com.shenyouchu.core.proactive.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.Instant;

/**
 * 主动消息成功响应（文档 09 §6.4）。
 *
 * @param id                消息 ID（字符串，避免前端丢失雪花 ID 精度）
 * @param conversationId    会话 ID（字符串）
 * @param role              固定 assistant
 * @param content           生成的正文
 * @param source            固定 proactive
 * @param trigger           本次实际使用的场景：share / follow_up / reminder
 * @param temperature       本次生效温度
 * @param temperatureSource 温度来源：auto / manual / user（官方角色沿用用户级配置）
 * @param createdAt         消息创建时间
 */
public record ProactiveMessageView(
        String id,
        String conversationId,
        String role,
        String content,
        String source,
        String trigger,
        double temperature,
        String temperatureSource,
        @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt) {
}
