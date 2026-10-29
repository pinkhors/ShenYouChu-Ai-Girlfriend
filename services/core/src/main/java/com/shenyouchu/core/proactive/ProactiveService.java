package com.shenyouchu.core.proactive;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.CharacterExpressionService;
import com.shenyouchu.core.character.CharacterPersona;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.dto.ExpressionConfig;
import com.shenyouchu.core.character.dto.PersonalityView;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.Conversation;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.expression.ExpressionScene;
import com.shenyouchu.core.expression.ProactiveBlockReason;
import com.shenyouchu.core.expression.ProactiveContext;
import com.shenyouchu.core.expression.ProactiveDecision;
import com.shenyouchu.core.expression.ProactivePolicy;
import com.shenyouchu.core.expression.ProactiveQualityGate;
import com.shenyouchu.core.expression.QualityVerdict;
import com.shenyouchu.core.llm.settings.UserLlmSettingsService;
import com.shenyouchu.core.message.Message;
import com.shenyouchu.core.message.mapper.MessageMapper;
import com.shenyouchu.core.persona.PersonaService;
import com.shenyouchu.core.proactive.dto.ProactiveEligibilityView;
import com.shenyouchu.core.proactive.dto.ProactiveMessageView;
import com.shenyouchu.core.proactive.dto.ProactiveRequest;
import com.shenyouchu.core.turn.ReplyGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * 主动消息服务（文档 09 §6.4 / §8）。
 *
 * <p>职责边界：
 * <ul>
 *   <li>可开口性完全交给纯逻辑 {@link ProactivePolicy}，本类只负责取数与错误映射；</li>
 *   <li>温度来自角色表达配置（{@link CharacterExpressionService}），官方角色回退用户级配置；</li>
 *   <li>生成后过 {@link ProactiveQualityGate}，失败降温重试一次，仍失败则不落库。</li>
 * </ul>
 *
 * <p>同一会话的并发触发不做强一致保证（PRD §10.9）：前端在请求中禁用按钮，
 * 服务端依靠冷却窗口降低重复概率。
 */
@Service
public class ProactiveService {

    private static final Logger log = LoggerFactory.getLogger(ProactiveService.class);

    private static final String SOURCE_PROACTIVE = "proactive";
    private static final String ROLE_USER = "user";
    private static final String ROLE_ASSISTANT = "assistant";

    private static final String CODE_GENERATION_FAILED = "PROACTIVE_GENERATION_FAILED";
    private static final String CODE_SUPPRESSED = "PROACTIVE_SUPPRESSED";

    /** 读取最近 20 条消息推导会话状态。 */
    private static final int HISTORY_WINDOW = 20;
    /** 生成提示注入最近 8 条消息。 */
    private static final int TRANSCRIPT_WINDOW = 8;
    /** 提示中的历史总长上限（字符）。 */
    private static final int TRANSCRIPT_MAX_CHARS = 1200;
    /** 质量闸门对比最近 3 条 assistant 消息。 */
    private static final int RECENT_ASSISTANT_WINDOW = 3;
    /** 闸门失败后的降温幅度。 */
    private static final double RETRY_TEMPERATURE_DROP = 0.10;

    private static final double TEMPERATURE_MIN = 0.30;
    private static final double TEMPERATURE_MAX = 1.20;

    private static final String PROACTIVE_INSTRUCTION =
            "现在由你主动开口：基于你们最近的对话，自然地对他说一句。"
                    + "只输出你要对他说的那句话，不要旁白、不要动作描写、不要提到系统或提示词；"
                    + "最多问一个问题，不超过 120 字。";

    private static final Map<ProactiveBlockReason, String> BLOCK_MESSAGES = Map.of(
            ProactiveBlockReason.PRIVACY_DISABLED, "她尊重你的隐私设置，暂时不会主动打扰",
            ProactiveBlockReason.USER_BUSY, "你现在不方便，她先不打扰",
            ProactiveBlockReason.NO_HISTORY, "先和她说句话吧",
            ProactiveBlockReason.QUIET_HOURS, "她现在在休息，明天早上再来找你",
            ProactiveBlockReason.UNANSWERED_LIMIT, "你已经有一阵没回她了，先陪她说句话吧",
            ProactiveBlockReason.DAILY_LIMIT, "她今天已经主动找过你了，留点话明天说",
            ProactiveBlockReason.USER_JUST_REPLIED, "她还在听你说，不用急着让她开口",
            ProactiveBlockReason.COOLDOWN, "她刚说过话，等一会儿再让她开口");

    private final ConversationMapper conversationMapper;
    private final MessageMapper messageMapper;
    private final CharacterMapper characterMapper;
    private final CharacterExpressionService expressionService;
    private final UserLlmSettingsService settingsService;
    private final PersonaService personaService;
    private final ReplyGenerator replyGenerator;
    private final ActivityService activityService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;
    private final ProactivePolicy policy = new ProactivePolicy();
    private final ProactiveQualityGate qualityGate = new ProactiveQualityGate();
    private final LocalTime quietStart;
    private final LocalTime quietEnd;
    private final Clock clock;

    @Autowired
    public ProactiveService(ConversationMapper conversationMapper,
                            MessageMapper messageMapper,
                            CharacterMapper characterMapper,
                            CharacterExpressionService expressionService,
                            UserLlmSettingsService settingsService,
                            PersonaService personaService,
                            ReplyGenerator replyGenerator,
                            ActivityService activityService,
                            ObjectMapper objectMapper,
                            PlatformTransactionManager transactionManager,
                            @Value("${shenyouchu.proactive.quiet-start:23:00}") String quietStart,
                            @Value("${shenyouchu.proactive.quiet-end:08:00}") String quietEnd) {
        this(conversationMapper, messageMapper, characterMapper, expressionService, settingsService,
                personaService, replyGenerator, activityService, objectMapper, transactionManager,
                quietStart, quietEnd, Clock.systemDefaultZone());
    }

    /** 测试注入固定时钟；生产使用系统默认时区。 */
    ProactiveService(ConversationMapper conversationMapper,
                     MessageMapper messageMapper,
                     CharacterMapper characterMapper,
                     CharacterExpressionService expressionService,
                     UserLlmSettingsService settingsService,
                     PersonaService personaService,
                     ReplyGenerator replyGenerator,
                     ActivityService activityService,
                     ObjectMapper objectMapper,
                     PlatformTransactionManager transactionManager,
                     String quietStart,
                     String quietEnd,
                     Clock clock) {
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.characterMapper = characterMapper;
        this.expressionService = expressionService;
        this.settingsService = settingsService;
        this.personaService = personaService;
        this.replyGenerator = replyGenerator;
        this.activityService = activityService;
        this.objectMapper = objectMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.quietStart = parseTime(quietStart, LocalTime.of(23, 0));
        this.quietEnd = parseTime(quietEnd, LocalTime.of(8, 0));
        this.clock = clock == null ? Clock.systemDefaultZone() : clock;
    }

    /** 可开口性查询：不生成、不落库、不写活动事件。 */
    public ProactiveEligibilityView eligibility(Long userId, Long conversationId) {
        Conversation conversation = requireOwned(userId, conversationId);
        History history = history(userId, conversationId);
        CharacterProfile character = character(conversation);
        ProactiveDecision decision = decide(userId, character, history, null);
        return new ProactiveEligibilityView(
                decision.allowed(),
                decision.allowed() ? null : decision.reason().name(),
                decision.scene(),
                decision.dailyLimit(),
                decision.usedToday(),
                decision.nextEligibleAt());
    }

    /** 触发一次主动开口：阻塞 409、质量闸门 409、模型异常 502。 */
    public ProactiveMessageView send(Long userId, Long conversationId, ProactiveRequest request) {
        String requestedScene = normalizeTrigger(request == null ? null : request.trigger());
        Conversation conversation = requireOwned(userId, conversationId);
        History history = history(userId, conversationId);
        CharacterProfile character = character(conversation);

        ProactiveDecision decision = decide(userId, character, history, requestedScene);
        if (!decision.allowed()) {
            throw blocked(decision.reason());
        }

        String systemPrompt = personaService.systemPrompt(conversation.getCharacterId());
        String prompt = proactivePrompt(history.messages());
        String temperatureSource = temperatureSource(character);
        double temperature = temperatureFor(userId, character, decision.scene());

        List<String> recentAssistant = recentAssistantContents(history.messages());
        String reply = generate(userId, conversation.getCharacterId(), systemPrompt, prompt, temperature);
        QualityVerdict verdict = qualityGate.check(reply, recentAssistant);
        if (!verdict.ok()) {
            log.info("主动消息未通过质量闸门（{}），降温重试一次 conversation={}", verdict.reason(), conversationId);
            double retryTemperature = retryTemperature(temperature);
            reply = generate(userId, conversation.getCharacterId(), systemPrompt, prompt, retryTemperature);
            verdict = qualityGate.check(reply, recentAssistant);
        }
        if (!verdict.ok()) {
            throw new ApiException(CODE_SUPPRESSED, HttpStatus.CONFLICT, "她想了想，还是决定不打扰你");
        }

        return persist(conversation, userId, reply, decision.scene(), temperature, temperatureSource);
    }

    private ProactiveDecision decide(Long userId, CharacterProfile character, History history,
                                     String requestedScene) {
        double temperature = temperatureFor(userId, character, requestedScene);
        ProactiveContext context = new ProactiveContext(
                clock.instant(),
                clock.getZone(),
                history.lastUserMessageAt(),
                history.lastProactiveAt(),
                history.proactiveCountToday(),
                history.unansweredCount(),
                quietStart,
                quietEnd,
                initiative(character),
                temperature,
                false,
                false,
                requestedScene);
        return policy.evaluate(context);
    }

    /**
     * 角色级温度：自定义角色按场景解析；官方角色/缺失角色得到 NaN，回退用户级配置。
     */
    private double temperatureFor(Long userId, CharacterProfile character, String scene) {
        double temperature = expressionService.temperature(character, sceneOf(scene));
        if (Double.isNaN(temperature)) {
            return settingsService.effective(userId).temperature();
        }
        return temperature;
    }

    /** 温度来源：official 走用户级配置标注 user；自定义角色区分 auto/manual。 */
    private String temperatureSource(CharacterProfile character) {
        if (character == null || character.getOwnerUserId() == null) {
            return "user";
        }
        JsonNode persona = CharacterPersona.parse(objectMapper, character.getPersonaConfig());
        ExpressionConfig config = CharacterPersona.expression(persona);
        String mode = config.mode() == null ? "" : config.mode().trim().toLowerCase(Locale.ROOT);
        boolean manual = ExpressionConfig.MODE_MANUAL.equals(mode) && config.temperatureOverride() != null;
        return manual ? "manual" : "auto";
    }

    /** 主动程度只影响日上限，缺省 medium。 */
    private String initiative(CharacterProfile character) {
        if (character == null) {
            return "medium";
        }
        JsonNode persona = CharacterPersona.parse(objectMapper, character.getPersonaConfig());
        PersonalityView personality = CharacterPersona.personality(persona);
        String initiative = personality == null ? null : personality.initiative();
        return initiative == null || initiative.isBlank() ? "medium" : initiative;
    }

    private String generate(Long userId, Long characterId, String systemPrompt, String prompt,
                            double temperature) {
        try {
            return replyGenerator.generate(userId, characterId, systemPrompt, prompt, temperature);
        } catch (RuntimeException ex) {
            log.warn("主动消息生成失败 character={}: {}", characterId, ex.getMessage());
            throw new ApiException(CODE_GENERATION_FAILED, HttpStatus.BAD_GATEWAY,
                    "她这会儿有点走神，稍后再试");
        }
    }

    private ProactiveMessageView persist(Conversation conversation, Long userId, String content,
                                         String trigger, double temperature, String temperatureSource) {
        String turnId = UUID.randomUUID().toString();
        Long conversationId = conversation.getId();
        Instant now = clock.instant();

        ProactiveMessageView view = transactionTemplate.execute(status -> {
            Message message = new Message(conversationId, userId, turnId, ROLE_ASSISTANT, content);
            message.setSource(SOURCE_PROACTIVE);
            messageMapper.insert(message);

            conversation.setLastMessageAt(now);
            conversationMapper.updateById(conversation);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("messageId", String.valueOf(message.getId()));
            payload.put("trigger", trigger);
            payload.put("temperature", temperature);
            payload.put("temperatureSource", temperatureSource);
            activityService.record(userId, "proactive.sent", "AI", "core", conversationId, turnId,
                    null, payload);

            Instant createdAt = message.getCreatedAt() == null ? now : message.getCreatedAt();
            return new ProactiveMessageView(String.valueOf(message.getId()),
                    String.valueOf(conversationId), ROLE_ASSISTANT, content, SOURCE_PROACTIVE,
                    trigger, temperature, temperatureSource, createdAt);
        });
        if (view == null) {
            throw new IllegalStateException("事务未返回主动消息结果");
        }
        return view;
    }

    /** 最近 20 条消息 → 会话状态快照。查询按 id 倒序取，再翻正为时间升序。 */
    private History history(Long userId, Long conversationId) {
        List<Message> rows = messageMapper.selectList(Wrappers.<Message>query()
                .eq("user_id", userId)
                .eq("conversation_id", conversationId)
                .orderByDesc("id")
                .last("LIMIT " + HISTORY_WINDOW));
        List<Message> messages = new ArrayList<>(rows == null ? List.of() : rows);
        Collections.reverse(messages);

        LocalDate today = clock.instant().atZone(clock.getZone()).toLocalDate();
        Instant lastUserMessageAt = null;
        Instant lastProactiveAt = null;
        for (Message message : messages) {
            if (isUser(message)) {
                lastUserMessageAt = message.getCreatedAt();
            }
            if (isProactive(message)) {
                lastProactiveAt = message.getCreatedAt();
            }
        }
        /* 日计数单独查全量，避免最近 20 条窗口在密集聊天时低估已用额度。 */
        Instant dayStart = today.atStartOfDay(clock.getZone()).toInstant();
        Long countToday = messageMapper.selectCount(Wrappers.<Message>query()
                .eq("user_id", userId)
                .eq("conversation_id", conversationId)
                .eq("source", SOURCE_PROACTIVE)
                .ge("created_at", dayStart));
        int proactiveCountToday = countToday == null ? 0 : countToday.intValue();

        /* 未回复计数：从最新往回数，遇到用户消息即停。 */
        int unansweredCount = 0;
        for (int index = messages.size() - 1; index >= 0; index--) {
            Message message = messages.get(index);
            if (isUser(message)) {
                break;
            }
            if (isProactive(message)) {
                unansweredCount++;
            }
        }
        return new History(List.copyOf(messages), lastUserMessageAt, lastProactiveAt,
                proactiveCountToday, unansweredCount);
    }

    /** 最近 8 条消息按时间升序拼成 `用户：` / `她：` 的 transcript，超长从最早处截断。 */
    private String transcript(List<Message> messages) {
        int from = Math.max(0, messages.size() - TRANSCRIPT_WINDOW);
        List<String> lines = new ArrayList<>(TRANSCRIPT_WINDOW);
        for (int index = from; index < messages.size(); index++) {
            Message message = messages.get(index);
            String content = message.getContent() == null ? "" : message.getContent().replaceAll("\\s+", " ").trim();
            if (content.isEmpty()) {
                continue;
            }
            lines.add((isUser(message) ? "用户：" : "她：") + content);
        }

        int total = lines.stream().mapToInt(line -> line.length() + 1).sum();
        int start = 0;
        while (start < lines.size() && total > TRANSCRIPT_MAX_CHARS) {
            total -= lines.get(start).length() + 1;
            start++;
        }
        String text = String.join("\n", lines.subList(start, lines.size()));
        return text.length() > TRANSCRIPT_MAX_CHARS
                ? text.substring(text.length() - TRANSCRIPT_MAX_CHARS)
                : text;
    }

    private String proactivePrompt(List<Message> messages) {
        String transcript = transcript(messages);
        if (transcript.isBlank()) {
            return PROACTIVE_INSTRUCTION;
        }
        return "最近的对话：\n" + transcript + "\n\n" + PROACTIVE_INSTRUCTION;
    }

    private List<String> recentAssistantContents(List<Message> messages) {
        List<String> contents = new ArrayList<>();
        for (Message message : messages) {
            if (ROLE_ASSISTANT.equals(message.getRole())
                    && message.getContent() != null && !message.getContent().isBlank()) {
                contents.add(message.getContent());
            }
        }
        int from = Math.max(0, contents.size() - RECENT_ASSISTANT_WINDOW);
        return List.copyOf(contents.subList(from, contents.size()));
    }

    private Conversation requireOwned(Long userId, Long conversationId) {
        Conversation conversation = conversationMapper.selectOne(Wrappers.<Conversation>lambdaQuery()
                .eq(Conversation::getId, conversationId)
                .eq(Conversation::getUserId, userId));
        if (conversation == null) {
            throw ApiException.notFound("会话不存在");
        }
        return conversation;
    }

    private CharacterProfile character(Conversation conversation) {
        Long characterId = conversation.getCharacterId();
        return characterId == null ? null : characterMapper.selectById(characterId);
    }

    private static boolean isUser(Message message) {
        return ROLE_USER.equals(message.getRole());
    }

    private static boolean isProactive(Message message) {
        return ROLE_ASSISTANT.equals(message.getRole()) && SOURCE_PROACTIVE.equals(message.getSource());
    }

    private static ExpressionScene sceneOf(String scene) {
        if (scene == null) {
            return ExpressionScene.REPLY;
        }
        return switch (scene.trim().toLowerCase(Locale.ROOT)) {
            case "share" -> ExpressionScene.PROACTIVE_SHARE;
            case "reminder" -> ExpressionScene.PROACTIVE_REMINDER;
            default -> ExpressionScene.PROACTIVE_FOLLOW_UP;
        };
    }

    private static String normalizeTrigger(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trigger = raw.trim().toLowerCase(Locale.ROOT);
        return switch (trigger) {
            case "share", "follow_up", "reminder" -> trigger;
            default -> throw ApiException.validation("触发场景不合法，请重试。");
        };
    }

    private static ApiException blocked(ProactiveBlockReason reason) {
        String message = BLOCK_MESSAGES.getOrDefault(reason, "她这会儿不太方便开口");
        return new ApiException("PROACTIVE_" + reason.name(), HttpStatus.CONFLICT, message);
    }

    private static double retryTemperature(double temperature) {
        return round2(Math.max(TEMPERATURE_MIN, Math.min(TEMPERATURE_MAX,
                temperature - RETRY_TEMPERATURE_DROP)));
    }

    private static double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private static LocalTime parseTime(String raw, LocalTime fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return LocalTime.parse(raw.trim());
        } catch (DateTimeParseException ex) {
            log.warn("免打扰时间配置不合法（{}），回退 {}", raw, fallback);
            return fallback;
        }
    }

    /** 最近消息推导出的会话状态。 */
    private record History(List<Message> messages, Instant lastUserMessageAt, Instant lastProactiveAt,
                           int proactiveCountToday, int unansweredCount) {
    }
}
