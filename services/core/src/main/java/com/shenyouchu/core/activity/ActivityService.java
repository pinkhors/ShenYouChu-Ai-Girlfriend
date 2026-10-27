package com.shenyouchu.core.activity;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.activity.mapper.ActivityEventMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

/** 活动事件写入：只记录必要元数据与资源 ID，不复制正文。 */
@Service
public class ActivityService {

    private final ActivityEventMapper activityEventMapper;
    private final ObjectMapper objectMapper;

    public ActivityService(ActivityEventMapper activityEventMapper, ObjectMapper objectMapper) {
        this.activityEventMapper = activityEventMapper;
        this.objectMapper = objectMapper;
    }

    public void record(Long userId, String eventType, String actor, String source,
                       Long conversationId, String turnId, String traceId, Map<String, Object> payload) {
        ActivityEvent event = new ActivityEvent(
                userId,
                eventType,
                actor,
                source,
                Instant.now(),
                conversationId,
                turnId,
                traceId,
                toJson(payload));
        activityEventMapper.insert(event);
    }

    private String toJson(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }
}
