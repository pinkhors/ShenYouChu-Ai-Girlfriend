package com.shenyouchu.core.common;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 轻量幂等缓存：同一用户携带相同 Idempotency-Key 的写请求只执行一次，重放返回首次结果。
 * 单实例内存实现（与取消注册表一致）；多实例部署时替换为 Redis，接口不变。
 */
@Service
public class IdempotencyService {

    private static final Duration TTL = Duration.ofMinutes(10);

    private record Entry(Long userId, Object response, Instant expiresAt) {
    }

    private final ConcurrentMap<String, Entry> entries = new ConcurrentHashMap<>();

    @SuppressWarnings("unchecked")
    public <T> Optional<T> find(String key, Long userId, Class<T> type) {
        if (key == null || key.isBlank()) {
            return Optional.empty();
        }
        Entry entry = entries.get(key);
        if (entry == null) {
            return Optional.empty();
        }
        if (entry.expiresAt().isBefore(Instant.now())) {
            entries.remove(key);
            return Optional.empty();
        }
        if (!entry.userId().equals(userId) || !type.isInstance(entry.response())) {
            return Optional.empty();
        }
        return Optional.of((T) entry.response());
    }

    public void store(String key, Long userId, Object response) {
        if (key == null || key.isBlank()) {
            return;
        }
        entries.put(key, new Entry(userId, response, Instant.now().plus(TTL)));
        if (entries.size() > 10_000) {
            Instant now = Instant.now();
            entries.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
        }
    }

    /** 仅用于测试或管理端点：当前缓存条目数。 */
    public int size() {
        return entries.size();
    }

    /** 仅用于测试：清空缓存。 */
    public void clear() {
        entries.clear();
    }
}