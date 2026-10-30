package com.shenyouchu.core.voice.provider;

import com.shenyouchu.core.common.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VoiceGenerationServiceTest {

    /** 不接数据库的凭据服务替身：resolve 固定返回可用凭据。 */
    private static VoiceCredentialService stubCredentials() {
        return new VoiceCredentialService(null, null, null, null) {
            @Override
            public Map<String, String> resolve(Long userId, String providerId) {
                return Map.of("apiKey", "test");
            }
        };
    }

    private static VoiceProvider provider(String id, boolean enabled, VoiceCapability... caps) {
        VoiceProviderDescriptor descriptor = new VoiceProviderDescriptor(
                id, id, "", Set.of(caps), List.of(), Map.of(), List.of("zh"), 50, enabled);
        return new VoiceProvider() {
            @Override
            public VoiceProviderDescriptor descriptor() {
                return descriptor;
            }

            @Override
            public VoiceProviderValidation validate(Map<String, String> credential) {
                return VoiceProviderValidation.ok();
            }

            @Override
            public VoiceSynthesisResult synthesize(VoiceSynthesisCommand command, Map<String, String> credential) {
                return new VoiceSynthesisResult(new byte[]{1, 2, 3}, "mp3", "req-" + command.text());
            }
        };
    }

    private static VoiceSegmentInput segment(String id, String provider, String capability, String text) {
        return new VoiceSegmentInput(id, provider, capability, text, Map.of());
    }

    private VoiceGenerationService service(VoiceProvider... providers) {
        return new VoiceGenerationService(
                new VoiceProviderRegistry(List.of(providers)), stubCredentials());
    }

    @Test
    void rejectsEmptyRequest() {
        VoiceGenerationService service = service(provider("a", true, VoiceCapability.SPEAK));
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("single", List.of())))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("magic",
                List.of(segment("s1", "a", "SPEAK", "你好")))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("未知生成模式");
    }

    @Test
    void singleModeRejectsTwoSegmentsAndUnknownCapability() {
        VoiceGenerationService service = service(provider("a", true, VoiceCapability.SPEAK));
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("single",
                List.of(segment("s1", "a", "SPEAK", "你好"), segment("s2", "a", "SPEAK", "再见")))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("1 段");
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("single",
                List.of(segment("s1", "a", "DANCE", "你好")))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("未知能力");
    }

    @Test
    void rejectsDisabledProviderAndUnsupportedCapability() {
        VoiceGenerationService service = service(
                provider("off", false, VoiceCapability.SPEAK),
                provider("sing", true, VoiceCapability.SING));
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("single",
                List.of(segment("s1", "off", "SPEAK", "你好")))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("暂未开放");
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("single",
                List.of(segment("s1", "sing", "SPEAK", "你好")))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("不支持");
    }

    @Test
    void singleTwoRequiresSameProviderAndDualRequiresDistinct() {
        VoiceGenerationService service = service(
                provider("a", true, VoiceCapability.SPEAK, VoiceCapability.SING),
                provider("b", true, VoiceCapability.SPEAK));
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("single_two",
                List.of(segment("s1", "a", "SPEAK", "你好"), segment("s2", "b", "SPEAK", "再见")))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("同一个模型");
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("dual",
                List.of(segment("s1", "a", "SPEAK", "你好"), segment("s2", "a", "SING", "啦啦")))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("两个不同模型");
    }

    @Test
    void rejectsTextOverProviderLimit() {
        VoiceGenerationService service = service(provider("a", true, VoiceCapability.SPEAK));
        assertThatThrownBy(() -> service.submit(1L, new VoiceGenerateRequest("single",
                List.of(segment("s1", "a", "SPEAK", "字".repeat(51))))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("超过");
    }

    @Test
    void submitSucceedsAndBatchIsOwnedByUser() throws InterruptedException {
        VoiceGenerationService service = service(provider("a", true, VoiceCapability.SPEAK));
        VoiceBatchView batch = service.submit(7L, new VoiceGenerateRequest("single",
                List.of(segment("s1", "a", "SPEAK", "你好"))));
        assertThat(batch.segments()).hasSize(1);
        assertThat(batch.batchId()).startsWith("gen_");

        VoiceBatchView settled = waitUntilSettled(service, 7L, batch.batchId());
        assertThat(settled.status()).isEqualTo("succeeded");
        assertThat(settled.segments().get(0).audioBase64()).isNotBlank();
        assertThat(settled.expiresAt()).isAfter(settled.createdAt());

        assertThatThrownBy(() -> service.get(8L, batch.batchId()))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("不存在");
    }

    private static VoiceBatchView waitUntilSettled(VoiceGenerationService service, Long userId, String batchId)
            throws InterruptedException {
        for (int attempt = 0; attempt < 100; attempt++) {
            VoiceBatchView view = service.get(userId, batchId);
            if (!"queued".equals(view.status()) && !"running".equals(view.status())) {
                return view;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("batch did not settle in time");
    }
}
