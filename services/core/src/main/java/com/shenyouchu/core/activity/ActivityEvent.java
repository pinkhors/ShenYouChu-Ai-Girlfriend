package com.shenyouchu.core.activity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shenyouchu.core.common.BaseEntity;

import java.time.Instant;

/** 活动事件：引用正文 ID，不复制正文；payload 只放必要元数据。 */
@TableName("activity_events")
public class ActivityEvent extends BaseEntity {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long userId;

    private Long conversationId;

    private String turnId;

    private String eventType;

    private String actor;

    private String source;

    private Instant occurredAt;

    private String traceId;

    private Integer schemaVersion = 1;

    private String payload;

    protected ActivityEvent() {
    }

    public ActivityEvent(Long userId, String eventType, String actor, String source,
                         Instant occurredAt, Long conversationId, String turnId,
                         String traceId, String payload) {
        this.userId = userId;
        this.eventType = eventType;
        this.actor = actor;
        this.source = source;
        this.occurredAt = occurredAt;
        this.conversationId = conversationId;
        this.turnId = turnId;
        this.traceId = traceId;
        this.payload = payload;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getConversationId() {
        return conversationId;
    }

    public void setConversationId(Long conversationId) {
        this.conversationId = conversationId;
    }

    public String getTurnId() {
        return turnId;
    }

    public void setTurnId(String turnId) {
        this.turnId = turnId;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public String getActor() {
        return actor;
    }

    public void setActor(String actor) {
        this.actor = actor;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }

    public String getTraceId() {
        return traceId;
    }

    public void setTraceId(String traceId) {
        this.traceId = traceId;
    }

    public Integer getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(Integer schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public String getPayload() {
        return payload;
    }

    public void setPayload(String payload) {
        this.payload = payload;
    }
}
