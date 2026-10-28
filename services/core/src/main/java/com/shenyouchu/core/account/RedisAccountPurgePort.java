package com.shenyouchu.core.account;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

/**
 * Redis 会话/临时状态清理：删除该用户在各键空间下的键。
 *
 * 键命名约定见数据与接口契约 7.1：`sess:{userId}:*`、`turn:{userId}:*`、
 * `rate:{userId}:*`、`media:{userId}:*`。实现幂等，可重复调用。
 */
@Component
@ConditionalOnProperty(name = "shenyouchu.redis.enabled", havingValue = "true")
public class RedisAccountPurgePort implements AccountPurgePort {

    private static final Logger log = LoggerFactory.getLogger(RedisAccountPurgePort.class);
    private static final List<String> KEY_PATTERNS = List.of("sess", "turn", "rate", "media");

    private final StringRedisTemplate redisTemplate;

    public RedisAccountPurgePort(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void purge(Long userId) {
        long deleted = 0L;
        for (String prefix : KEY_PATTERNS) {
            Set<String> keys = redisTemplate.keys(prefix + ":" + userId + ":*");
            if (keys != null && !keys.isEmpty()) {
                deleted += redisTemplate.delete(keys);
            }
        }
        log.info("Redis purge finished for userId={}, deleted keys={}", userId, deleted);
    }
}