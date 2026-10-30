package com.shenyouchu.core.voice.provider;

import com.shenyouchu.core.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 语音工作台统一接口：Provider 元数据、BYOK 凭据、批量生成。
 * 前端只依赖这些接口，不直接接触 CosyVoice/Breeze 的原生协议。
 */
@RestController
@RequestMapping("/api/v1/ai-girl/voice")
public class VoiceProviderController {

    private final VoiceCredentialService credentialService;
    private final VoiceGenerationService generationService;

    public VoiceProviderController(VoiceCredentialService credentialService,
                                   VoiceGenerationService generationService) {
        this.credentialService = credentialService;
        this.generationService = generationService;
    }

    @GetMapping("/providers")
    public List<VoiceProviderView> providers() {
        return credentialService.providers(CurrentUser.require().userId());
    }

    @PutMapping("/providers/{providerId}/credential")
    public VoiceCredentialView saveCredential(@PathVariable String providerId,
                                              @RequestBody VoiceCredentialRequest request) {
        return credentialService.save(CurrentUser.require().userId(), providerId, request);
    }

    @PostMapping("/providers/{providerId}/validate")
    public VoiceValidationView validateCredential(@PathVariable String providerId) {
        return VoiceValidationView.from(credentialService.validate(CurrentUser.require().userId(), providerId));
    }

    @DeleteMapping("/providers/{providerId}/credential")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCredential(@PathVariable String providerId) {
        credentialService.delete(CurrentUser.require().userId(), providerId);
    }

    @PostMapping("/generate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public VoiceBatchView generate(@RequestBody VoiceGenerateRequest request) {
        return generationService.submit(CurrentUser.require().userId(), request);
    }

    @GetMapping("/generate/{batchId}")
    public VoiceBatchView generation(@PathVariable String batchId) {
        return generationService.get(CurrentUser.require().userId(), batchId);
    }
}
