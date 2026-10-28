package com.shenyouchu.core.account;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 占位清理实现：当前基础设施尚未接入 Redis/Milvus/对象存储，
 * 这里只记录日志，保证删除流程可运行且行为可观测。
 */
@Component
public class NoOpAccountPurgePort implements AccountPurgePort {

    private static final Logger log = LoggerFactory.getLogger(NoOpAccountPurgePort.class);

    @Override
    public void purge(Long userId) {
        log.info("Account purge hook invoked for userId={} (Milvus/vector purge not wired yet)", userId);
    }
}
