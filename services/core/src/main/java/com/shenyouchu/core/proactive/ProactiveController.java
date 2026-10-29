package com.shenyouchu.core.proactive;

import com.shenyouchu.core.proactive.dto.ProactiveEligibilityView;
import com.shenyouchu.core.proactive.dto.ProactiveMessageView;
import com.shenyouchu.core.proactive.dto.ProactiveRequest;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 主动消息接口（契约见 docs/09 §6.4）。
 *
 * <p>userId 一律来自认证上下文；会话不存在或不属于当前用户都返回 404。
 */
@RestController
@RequestMapping("/api/v1/conversations/{conversationId}/proactive")
public class ProactiveController {

    private final ProactiveService proactiveService;

    public ProactiveController(ProactiveService proactiveService) {
        this.proactiveService = proactiveService;
    }

    /** 可开口性查询：返回 allowed/reason/scene/dailyLimit/usedToday/nextEligibleAt。 */
    @GetMapping("/eligibility")
    public ProactiveEligibilityView eligibility(@PathVariable Long conversationId) {
        return proactiveService.eligibility(CurrentUser.require().userId(), conversationId);
    }

    /** 让她先开口：成功返回落库消息；阻塞与质量闸门为 409，模型异常为 502。 */
    @PostMapping
    public ProactiveMessageView send(@PathVariable Long conversationId,
                                     @RequestBody(required = false) ProactiveRequest request) {
        return proactiveService.send(CurrentUser.require().userId(), conversationId, request);
    }
}
