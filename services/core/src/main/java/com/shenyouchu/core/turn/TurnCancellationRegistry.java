package com.shenyouchu.core.turn;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 活动轮次注册表：支持用户在生成过程中取消本轮。
 * M1 单实例内存实现；多实例部署时改为 Redis 并保留同一接口（见技术路线取消广播）。
 */
@Component
public class TurnCancellationRegistry {

    private record Entry(Long userId, AtomicBoolean cancelled) {
    }

    private final ConcurrentMap<String, Entry> entries = new ConcurrentHashMap<>();

    public void register(String turnId, Long userId) {
        entries.put(turnId, new Entry(userId, new AtomicBoolean(false)));
    }

    /** 只有轮次归属者可以取消；未知轮次或非归属者返回 false。 */
    public boolean cancel(String turnId, Long userId) {
        Entry entry = entries.get(turnId);
        if (entry == null || !entry.userId().equals(userId)) {
            return false;
        }
        entry.cancelled().set(true);
        return true;
    }

    public boolean isCancelled(String turnId) {
        Entry entry = entries.get(turnId);
        return entry != null && entry.cancelled().get();
    }

    public void clear(String turnId) {
        entries.remove(turnId);
    }
}
