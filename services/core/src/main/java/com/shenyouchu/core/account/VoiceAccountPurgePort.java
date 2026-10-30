package com.shenyouchu.core.account;

import com.shenyouchu.core.voice.provider.VoiceGenerationService;
import org.springframework.stereotype.Component;

/**
 * 账号删除时清理语音工作台的派生数据：内存中的生成任务与音频结果。
 *
 * <p>BYOK 凭据行（user_voice_credentials）在 {@link AccountDeletionService} 的 MySQL 级联里物理删除；
 * 这里只负责不在 MySQL 里的内存任务。实现幂等，purge 不存在的用户不报错。
 */
@Component
public class VoiceAccountPurgePort implements AccountPurgePort {

    private final VoiceGenerationService generationService;

    public VoiceAccountPurgePort(VoiceGenerationService generationService) {
        this.generationService = generationService;
    }

    @Override
    public void purge(Long userId) {
        generationService.purgeUser(userId);
    }
}
