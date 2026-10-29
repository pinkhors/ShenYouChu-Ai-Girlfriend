package com.shenyouchu.core.memorygraph;

import com.shenyouchu.core.account.AccountPurgePort;
import org.springframework.stereotype.Component;

/** 账号删除时清理记忆星图的派生数据（chunk/edge/recall/snapshot）。 */
@Component
public class MemoryGraphAccountPurgePort implements AccountPurgePort {

    private final MemoryGraphPurgeService purgeService;

    public MemoryGraphAccountPurgePort(MemoryGraphPurgeService purgeService) {
        this.purgeService = purgeService;
    }

    @Override
    public void purge(Long userId) {
        purgeService.purgeUser(userId);
    }
}
