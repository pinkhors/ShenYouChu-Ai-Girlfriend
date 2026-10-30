package com.shenyouchu.core.voice.provider;

import com.shenyouchu.core.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * 批量语音生成：校验模式/provider/能力/凭据，异步执行并保存内存任务。
 *
 * V1 先把任务放内存（7 天 TTL），便于先打通前端状态机；持久化任务表是后续迁移项。
 */
@Service
public class VoiceGenerationService {

    private static final Logger log = LoggerFactory.getLogger(VoiceGenerationService.class);
    private static final long RETENTION_DAYS = 7;

    private final VoiceProviderRegistry registry;
    private final VoiceCredentialService credentialService;
    private final Executor executor;
    private final Map<String, Job> jobs = new ConcurrentHashMap<>();

    public VoiceGenerationService(VoiceProviderRegistry registry, VoiceCredentialService credentialService) {
        this.registry = registry;
        this.credentialService = credentialService;
        this.executor = Executors.newFixedThreadPool(2, runnable -> {
            Thread thread = new Thread(runnable, "voice-generation");
            thread.setDaemon(true);
            return thread;
        });
    }

    public VoiceBatchView submit(Long userId, VoiceGenerateRequest request) {
        if (request == null || request.segments() == null || request.segments().isEmpty()) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "至少需要一段内容");
        }
        String mode = normalizeMode(request.mode());
        validateMode(mode, request.segments());

        Map<String, Map<String, String>> credentials = new LinkedHashMap<>();
        Set<String> ids = new HashSet<>();
        List<JobSegment> segments = new ArrayList<>();
        for (VoiceSegmentInput input : request.segments()) {
            if (input == null || input.id() == null || input.id().isBlank()) {
                throw ApiException.badRequest("VOICE_INVALID_REQUEST", "段落缺少 id");
            }
            if (!ids.add(input.id())) {
                throw ApiException.badRequest("VOICE_INVALID_REQUEST", "段落 id 重复");
            }
            if (input.providerId() == null || input.providerId().isBlank()) {
                throw ApiException.badRequest("VOICE_INVALID_REQUEST", "段落缺少模型");
            }
            VoiceProvider provider = registry.require(input.providerId());
            VoiceProviderDescriptor descriptor = provider.descriptor();
            if (!descriptor.enabled()) {
                throw ApiException.badRequest("VOICE_PROVIDER_DISABLED", descriptor.displayName() + " 暂未开放");
            }
            VoiceCapability capability = parseCapability(input.capability());
            if (!descriptor.capabilities().contains(capability)) {
                throw ApiException.badRequest("VOICE_CAPABILITY_UNSUPPORTED",
                        descriptor.displayName() + " 不支持 " + capability);
            }
            String text = input.text() == null ? "" : input.text().trim();
            if (text.isEmpty()) {
                throw ApiException.badRequest("VOICE_INVALID_REQUEST", "第 " + input.id() + " 段文本为空");
            }
            if (text.length() > descriptor.maxTextChars()) {
                throw ApiException.badRequest("VOICE_INVALID_REQUEST",
                        "第 " + input.id() + " 段超过 " + descriptor.maxTextChars() + " 字");
            }
            credentials.computeIfAbsent(input.providerId(),
                    providerId -> credentialService.resolve(userId, providerId));
            segments.add(new JobSegment(input.id(), input.providerId(), capability, text,
                    input.params() == null ? Map.of() : Map.copyOf(input.params())));
        }

        String batchId = "gen_" + UUID.randomUUID().toString().replace("-", "");
        Job job = new Job(batchId, userId, mode, segments);
        jobs.put(batchId, job);
        executor.execute(() -> run(job, credentials));
        return job.view();
    }

    public VoiceBatchView get(Long userId, String batchId) {
        Job job = jobs.get(batchId);
        if (job == null || !job.userId.equals(userId)) {
            throw ApiException.notFound("VOICE_BATCH_NOT_FOUND", "生成任务不存在或已过期");
        }
        return job.view();
    }

    @Scheduled(fixedDelay = 3_600_000)
    public void cleanupExpired() {
        Instant now = Instant.now();
        jobs.entrySet().removeIf(entry -> entry.getValue().expiresAt.isBefore(now));
    }

    /** 账号删除时立即丢弃该用户的内存任务与音频结果（幂等）。 */
    public void purgeUser(Long userId) {
        jobs.entrySet().removeIf(entry -> entry.getValue().userId.equals(userId));
    }

    private void run(Job job, Map<String, Map<String, String>> credentials) {
        job.status = "running";
        for (JobSegment segment : job.segments) {
            segment.status = "generating";
            try {
                VoiceProvider provider = registry.require(segment.providerId);
                VoiceSynthesisResult result = provider.synthesize(
                        new VoiceSynthesisCommand(segment.capability, segment.text, segment.params, "mp3"),
                        credentials.get(segment.providerId));
                if (result.audio() == null || result.audio().length == 0) {
                    throw new IllegalStateException("empty audio");
                }
                segment.audioBase64 = Base64.getEncoder().encodeToString(result.audio());
                segment.format = result.format() == null || result.format().isBlank() ? "mp3" : result.format();
                segment.status = "succeeded";
            } catch (ApiException ex) {
                segment.status = "failed";
                segment.errorCode = ex.getCode();
                segment.message = ex.getMessage();
                log.warn("voice segment {} failed: {}", segment.id, ex.getMessage());
            } catch (Exception ex) {
                segment.status = "failed";
                segment.errorCode = "VOICE_PROVIDER_UNAVAILABLE";
                segment.message = "语音生成失败";
                log.warn("voice segment {} failed unexpectedly: {}", segment.id, ex.toString());
            }
        }
        job.status = job.computeStatus();
    }

    private static void validateMode(String mode, List<VoiceSegmentInput> segments) {
        for (VoiceSegmentInput segment : segments) {
            if (segment == null || segment.providerId() == null || segment.providerId().isBlank()) {
                throw ApiException.badRequest("VOICE_INVALID_REQUEST", "段落缺少模型");
            }
        }
        switch (mode) {
            case "single" -> {
                if (segments.size() != 1) {
                    throw ApiException.badRequest("VOICE_INVALID_REQUEST", "单模型一段模式需要 1 段");
                }
            }
            case "single_two" -> {
                if (segments.size() != 2) {
                    throw ApiException.badRequest("VOICE_INVALID_REQUEST", "单模型两段模式需要 2 段");
                }
                if (!segments.get(0).providerId().equals(segments.get(1).providerId())) {
                    throw ApiException.badRequest("VOICE_INVALID_REQUEST", "单模型两段必须使用同一个模型");
                }
            }
            case "dual" -> {
                if (segments.size() != 2) {
                    throw ApiException.badRequest("VOICE_INVALID_REQUEST", "双模型模式需要 2 段");
                }
                if (segments.get(0).providerId().equals(segments.get(1).providerId())) {
                    throw ApiException.badRequest("VOICE_INVALID_REQUEST", "双模型模式需要选择两个不同模型");
                }
            }
            default -> throw ApiException.badRequest("VOICE_INVALID_REQUEST", "未知生成模式");
        }
    }

    private static String normalizeMode(String mode) {
        if (mode == null) {
            return "";
        }
        return switch (mode) {
            case "single", "single_two", "dual" -> mode;
            default -> "";
        };
    }

    private static VoiceCapability parseCapability(String value) {
        if (value == null) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "段落缺少能力");
        }
        try {
            return VoiceCapability.valueOf(value);
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("VOICE_INVALID_REQUEST", "未知能力: " + value);
        }
    }

    private static final class Job {
        private final String id;
        private final Long userId;
        private final String mode;
        private final List<JobSegment> segments;
        private final Instant createdAt = Instant.now();
        private final Instant expiresAt = createdAt.plus(RETENTION_DAYS, ChronoUnit.DAYS);
        private volatile String status = "queued";

        private Job(String id, Long userId, String mode, List<JobSegment> segments) {
            this.id = id;
            this.userId = userId;
            this.mode = mode;
            this.segments = segments;
        }

        private String computeStatus() {
            int success = 0;
            int failed = 0;
            for (JobSegment segment : segments) {
                if ("succeeded".equals(segment.status)) {
                    success++;
                } else if ("failed".equals(segment.status)) {
                    failed++;
                }
            }
            if (success == segments.size()) {
                return "succeeded";
            }
            if (failed == segments.size()) {
                return "failed";
            }
            return "partial";
        }

        private VoiceBatchView view() {
            List<VoiceSegmentView> views = new ArrayList<>();
            for (JobSegment segment : segments) {
                views.add(new VoiceSegmentView(
                        segment.id,
                        segment.providerId,
                        segment.capability.name(),
                        segment.status,
                        segment.audioBase64,
                        segment.format,
                        null,
                        segment.errorCode,
                        segment.message));
            }
            return new VoiceBatchView(id, status, createdAt, expiresAt, List.copyOf(views));
        }
    }

    private static final class JobSegment {
        private final String id;
        private final String providerId;
        private final VoiceCapability capability;
        private final String text;
        private final Map<String, String> params;
        private volatile String status = "queued";
        private volatile String audioBase64;
        private volatile String format;
        private volatile String errorCode;
        private volatile String message;

        private JobSegment(String id, String providerId, VoiceCapability capability,
                           String text, Map<String, String> params) {
            this.id = id;
            this.providerId = providerId;
            this.capability = capability;
            this.text = text;
            this.params = params;
        }
    }
}
