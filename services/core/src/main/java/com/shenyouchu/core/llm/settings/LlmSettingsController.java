package com.shenyouchu.core.llm.settings;

import com.shenyouchu.core.llm.settings.dto.LlmSettingsRequest;
import com.shenyouchu.core.llm.settings.dto.LlmSettingsView;
import com.shenyouchu.core.llm.settings.dto.LlmTestResult;
import com.shenyouchu.core.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 当前用户自己的 LLM 配置。
 * 身份只来自认证上下文；不提供“查看/修改他人配置”的入口。
 */
@RestController
@RequestMapping("/api/v1/settings/llm")
public class LlmSettingsController {

    private final UserLlmSettingsService settingsService;

    public LlmSettingsController(UserLlmSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    public LlmSettingsView get() {
        return settingsService.view(CurrentUser.require().userId());
    }

    @PutMapping
    public LlmSettingsView update(@Valid @RequestBody LlmSettingsRequest request) {
        return settingsService.save(CurrentUser.require().userId(), request);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reset() {
        settingsService.reset(CurrentUser.require().userId());
    }

    @PostMapping("/test")
    public LlmTestResult test() {
        return settingsService.test(CurrentUser.require().userId());
    }
}
