package com.shenyouchu.core.proactive;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.character.CharacterExpressionService;
import com.shenyouchu.core.character.CharacterProfile;
import com.shenyouchu.core.character.mapper.CharacterMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.conversation.Conversation;
import com.shenyouchu.core.conversation.mapper.ConversationMapper;
import com.shenyouchu.core.expression.ExpressionScene;
import com.shenyouchu.core.llm.EffectiveLlmConfig;
import com.shenyouchu.core.llm.settings.UserLlmSettingsService;
import com.shenyouchu.core.message.Message;
import com.shenyouchu.core.message.mapper.MessageMapper;
import com.shenyouchu.core.persona.PersonaService;
import com.shenyouchu.core.proactive.dto.ProactiveEligibilityView;
import com.shenyouchu.core.proactive.dto.ProactiveMessageView;
import com.shenyouchu.core.proactive.dto.ProactiveRequest;
import com.shenyouchu.core.turn.ReplyGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 主动消息服务测试（文档 09 §8 / §11 / AC-11）。
 *
 * <p>用动态代理与手写假实现代替 Mockito：本沙箱的 mock maker 无法附加 agent，
 * 这样测试在任何环境都能真实执行，而不是被跳过。
 */
class ProactiveServiceTest {

    private static final Long USER_ID = 1L;
    private static final Long CONVERSATION_ID = 2L;
    private static final Long CHARACTER_ID = 3L;
    private static final Long MESSAGE_ID = 900L;
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    /** 2026-10-29T14:00+08:00。 */
    private static final Instant AFTERNOON = Instant.parse("2026-10-29T06:00:00Z");
    /** 2026-10-29T23:30+08:00。 */
    private static final Instant QUIET_NIGHT = Instant.parse("2026-10-29T15:30:00Z");

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final List<Message> messages = new ArrayList<>();
    private final List<Message> inserted = new ArrayList<>();
    private final CapturingActivityService activityService = new CapturingActivityService();
    private final CapturingReplyGenerator replyGenerator = new CapturingReplyGenerator();

    private Conversation conversation;
    private CharacterProfile character;
    private boolean conversationUpdated;

    private ConversationMapper conversationMapper;
    private MessageMapper messageMapper;
    private CharacterMapper characterMapper;
    private PlatformTransactionManager transactionManager;
    private ExpressionStub expressionService;
    private SettingsStub settingsService;

    @BeforeEach
    void setUp() {
        conversation = new Conversation(USER_ID, CHARACTER_ID, null);
        conversation.setId(CONVERSATION_ID);

        character = new CharacterProfile();
        character.setId(CHARACTER_ID);
        character.setOwnerUserId(USER_ID);
        character.setPersonaConfig("{\"schemaVersion\":2,\"personality\":{\"archetype\":\"gentle\","
                + "\"intensity\":\"medium\",\"initiative\":\"medium\"}}");

        conversationMapper = proxy(ConversationMapper.class, (proxy, method, args) -> switch (method.getName()) {
            case "selectOne" -> conversation;
            case "updateById" -> {
                conversationUpdated = true;
                yield 1;
            }
            default -> null;
        });
        messageMapper = proxy(MessageMapper.class, (proxy, method, args) -> switch (method.getName()) {
            case "selectList" -> {
                /* 模拟 ORDER BY id DESC：服务层会再翻正为时间升序。 */
                List<Message> rows = new ArrayList<>(messages);
                java.util.Collections.reverse(rows);
                yield rows;
            }
            case "insert" -> {
                Message message = (Message) args[0];
                message.setId(MESSAGE_ID);
                inserted.add(message);
                yield 1;
            }
            case "selectCount" -> messages.stream()
                    .filter(item -> "proactive".equals(item.getSource()))
                    .count();
            default -> null;
        });
        characterMapper = proxy(CharacterMapper.class,
                (proxy, method, args) -> "selectById".equals(method.getName()) ? character : null);
        transactionManager = proxy(PlatformTransactionManager.class, (proxy, method, args) -> null);

        expressionService = new ExpressionStub(0.74);
        settingsService = new SettingsStub(0.8);
    }

    private ProactiveService service(Instant now) {
        PersonaService personaService = new PersonaService(null, objectMapper) {
            @Override
            public String systemPrompt(Long characterId) {
                return "SYSTEM-PROMPT";
            }
        };
        return new ProactiveService(conversationMapper, messageMapper, characterMapper,
                expressionService, settingsService, personaService, replyGenerator, activityService,
                objectMapper, transactionManager, "23:00", "08:00", Clock.fixed(now, ZONE));
    }

    @Test
    void allowedTriggerPersistsProactiveMessageAndActivity() {
        messages.add(message(1L, "assistant", "proactive", "今天风好大",
                AFTERNOON.minus(3, ChronoUnit.HOURS)));
        messages.add(message(2L, "user", "text", "我刚下班", AFTERNOON.minus(2, ChronoUnit.HOURS)));
        replyGenerator.reply = "你昨天说今天要复诊，去了吗？";

        ProactiveMessageView view = service(AFTERNOON)
                .send(USER_ID, CONVERSATION_ID, new ProactiveRequest("follow_up"));

        assertThat(view.role()).isEqualTo("assistant");
        assertThat(view.source()).isEqualTo("proactive");
        assertThat(view.conversationId()).isEqualTo(String.valueOf(CONVERSATION_ID));
        assertThat(view.trigger()).isEqualTo("follow_up");
        assertThat(view.temperature()).isEqualTo(0.74);
        assertThat(view.temperatureSource()).isEqualTo("auto");
        assertThat(view.content()).isEqualTo(replyGenerator.reply);
        assertThat(view.createdAt()).isEqualTo(AFTERNOON);

        assertThat(inserted).hasSize(1);
        Message saved = inserted.get(0);
        assertThat(saved.getId()).isEqualTo(MESSAGE_ID);
        assertThat(saved.getSource()).isEqualTo("proactive");
        assertThat(saved.getRole()).isEqualTo("assistant");
        assertThat(saved.getContent()).isEqualTo(replyGenerator.reply);
        assertThat(saved.getConversationId()).isEqualTo(CONVERSATION_ID);
        assertThat(saved.getUserId()).isEqualTo(USER_ID);
        assertThat(saved.getTurnId()).isNotBlank();

        assertThat(conversationUpdated).isTrue();
        assertThat(conversation.getLastMessageAt()).isEqualTo(AFTERNOON);

        assertThat(activityService.recorded).hasSize(1);
        Recorded event = activityService.recorded.get(0);
        assertThat(event.userId()).isEqualTo(USER_ID);
        assertThat(event.eventType()).isEqualTo("proactive.sent");
        assertThat(event.actor()).isEqualTo("AI");
        assertThat(event.conversationId()).isEqualTo(CONVERSATION_ID);
        assertThat(event.payload()).containsEntry("messageId", String.valueOf(MESSAGE_ID))
                .containsEntry("trigger", "follow_up")
                .containsEntry("temperature", 0.74)
                .containsEntry("temperatureSource", "auto");

        /* 温度作为采样参数传入，不写进提示词（§8.4）。 */
        assertThat(replyGenerator.temperatures).containsExactly(0.74);
        assertThat(replyGenerator.systemPrompt).isEqualTo("SYSTEM-PROMPT");
        assertThat(replyGenerator.userText)
                .contains("用户：我刚下班")
                .contains("她：今天风好大")
                .contains("主动开口")
                .doesNotContain("0.74");
    }

    @Test
    void quietHoursBlocksWithStableCode() {
        messages.add(message(1L, "user", "text", "晚安", QUIET_NIGHT.minus(30, ChronoUnit.MINUTES)));

        assertBlocked(QUIET_NIGHT, "PROACTIVE_QUIET_HOURS", "休息");
        assertThat(replyGenerator.calls).isZero();
    }

    @Test
    void unansweredLimitBlocksBeforeDailyLimit() {
        messages.add(message(1L, "user", "text", "我去开会", Instant.parse("2026-10-29T02:00:00Z")));
        messages.add(message(2L, "assistant", "proactive", "开会顺利吗",
                Instant.parse("2026-10-29T03:00:00Z")));
        messages.add(message(3L, "assistant", "proactive", "结束了跟我说一声",
                Instant.parse("2026-10-29T04:00:00Z")));

        assertBlocked(AFTERNOON, "PROACTIVE_UNANSWERED_LIMIT", "没回她");
    }

    @Test
    void dailyLimitBlocksWhenQuotaUsedUp() {
        messages.add(message(1L, "user", "text", "早上好", Instant.parse("2026-10-29T02:00:00Z")));
        messages.add(message(2L, "assistant", "proactive", "早呀", Instant.parse("2026-10-29T03:00:00Z")));
        messages.add(message(3L, "user", "text", "在忙", Instant.parse("2026-10-29T04:00:00Z")));
        messages.add(message(4L, "assistant", "proactive", "那你先忙", Instant.parse("2026-10-29T05:00:00Z")));

        assertBlocked(AFTERNOON, "PROACTIVE_DAILY_LIMIT", "今天");
    }

    @Test
    void emptyConversationIsBlocked() {
        assertBlocked(AFTERNOON, "PROACTIVE_NO_HISTORY", "说句话");
    }

    @Test
    void qualityGateFailureSuppressesMessageWithoutPersisting() {
        messages.add(message(1L, "assistant", "proactive", "今天风好大",
                AFTERNOON.minus(3, ChronoUnit.HOURS)));
        messages.add(message(2L, "user", "text", "我刚下班", AFTERNOON.minus(2, ChronoUnit.HOURS)));
        replyGenerator.reply = "字".repeat(121);

        ProactiveService service = service(AFTERNOON);
        assertThatThrownBy(() -> service.send(USER_ID, CONVERSATION_ID, new ProactiveRequest("follow_up")))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    ApiException api = (ApiException) ex;
                    assertThat(api.getCode()).isEqualTo("PROACTIVE_SUPPRESSED");
                    assertThat(api.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(api.getMessage()).contains("不打扰你");
                });

        /* 降温 0.10 重试一次，仍失败则不落库、不写活动。 */
        assertThat(replyGenerator.temperatures).containsExactly(0.74, 0.64);
        assertThat(inserted).isEmpty();
        assertThat(activityService.recorded).isEmpty();
    }

    @Test
    void generationFailureReturnsBadGateway() {
        messages.add(message(1L, "user", "text", "我刚下班", AFTERNOON.minus(2, ChronoUnit.HOURS)));
        replyGenerator.failure = new IllegalStateException("upstream down");

        assertThatThrownBy(() -> service(AFTERNOON)
                .send(USER_ID, CONVERSATION_ID, new ProactiveRequest("follow_up")))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    ApiException api = (ApiException) ex;
                    assertThat(api.getCode()).isEqualTo("PROACTIVE_GENERATION_FAILED");
                    assertThat(api.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
                });

        assertThat(inserted).isEmpty();
    }

    @Test
    void invalidTriggerIsValidationFailure() {
        assertThatThrownBy(() -> service(AFTERNOON)
                .send(USER_ID, CONVERSATION_ID, new ProactiveRequest("spam")))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    ApiException api = (ApiException) ex;
                    assertThat(api.getCode()).isEqualTo("VALIDATION_FAILED");
                    assertThat(api.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                });
    }

    @Test
    void unknownConversationReturnsNotFound() {
        conversation = null;

        assertThatThrownBy(() -> service(AFTERNOON)
                .send(USER_ID, CONVERSATION_ID, new ProactiveRequest("share")))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getCode()).isEqualTo("NOT_FOUND"));
    }

    @Test
    void eligibilityReportsQuietHoursAndNextWindow() {
        messages.add(message(1L, "user", "text", "晚安", QUIET_NIGHT.minus(30, ChronoUnit.MINUTES)));

        ProactiveEligibilityView view = service(QUIET_NIGHT).eligibility(USER_ID, CONVERSATION_ID);

        assertThat(view.allowed()).isFalse();
        assertThat(view.reason()).isEqualTo("QUIET_HOURS");
        assertThat(view.scene()).isEqualTo("follow_up");
        assertThat(view.dailyLimit()).isEqualTo(2);
        assertThat(view.usedToday()).isZero();
        assertThat(view.nextEligibleAt()).isEqualTo(Instant.parse("2026-10-30T00:00:00Z"));
        assertThat(inserted).isEmpty();
    }

    @Test
    void officialCharacterFallsBackToUserLevelTemperature() {
        character.setOwnerUserId(null);
        expressionService.temperature = Double.NaN;
        settingsService.temperature = 0.66;
        messages.add(message(1L, "user", "text", "我刚下班", AFTERNOON.minus(2, ChronoUnit.HOURS)));

        ProactiveMessageView view = service(AFTERNOON)
                .send(USER_ID, CONVERSATION_ID, new ProactiveRequest("share"));

        assertThat(view.temperature()).isEqualTo(0.66);
        assertThat(view.temperatureSource()).isEqualTo("user");
        assertThat(replyGenerator.temperatures).containsExactly(0.66);
    }

    private void assertBlocked(Instant now, String expectedCode, String messagePart) {
        assertThatThrownBy(() -> service(now).send(USER_ID, CONVERSATION_ID,
                new ProactiveRequest("follow_up")))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    ApiException api = (ApiException) ex;
                    assertThat(api.getCode()).isEqualTo(expectedCode);
                    assertThat(api.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(api.getMessage()).contains(messagePart);
                });
        assertThat(inserted).isEmpty();
        assertThat(activityService.recorded).isEmpty();
    }

    private static Message message(long id, String role, String source, String content, Instant createdAt) {
        Message message = new Message(CONVERSATION_ID, USER_ID, "turn-" + id, role, content);
        message.setId(id);
        message.setSource(source);
        message.setCreatedAt(createdAt);
        return message;
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
                (proxy, method, args) -> {
                    if (method.getDeclaringClass() == Object.class) {
                        return switch (method.getName()) {
                            case "toString" -> type.getSimpleName() + "Proxy";
                            case "hashCode" -> System.identityHashCode(proxy);
                            case "equals" -> proxy == args[0];
                            default -> null;
                        };
                    }
                    Object result = handler.invoke(proxy, method, args);
                    return result == null ? primitiveDefault(method.getReturnType()) : result;
                });
    }

    private static Object primitiveDefault(Class<?> type) {
        if (!type.isPrimitive()) {
            return null;
        }
        if (type == boolean.class) {
            return false;
        }
        if (type == int.class) {
            return 0;
        }
        if (type == long.class) {
            return 0L;
        }
        if (type == double.class) {
            return 0.0d;
        }
        return null;
    }

    /** 记录温度与最后一次提示的生成器假实现。 */
    private static final class CapturingReplyGenerator implements ReplyGenerator {

        private String reply = "今天过得怎么样？";
        private RuntimeException failure;
        private final List<Double> temperatures = new ArrayList<>();
        private String systemPrompt;
        private String userText;
        private int calls;

        @Override
        public String generate(Long userId, String systemPrompt, String userText) {
            return generate(userId, null, systemPrompt, userText, Double.NaN);
        }

        @Override
        public String generate(Long userId, Long characterId, String systemPrompt, String userText,
                               double temperature) {
            calls++;
            temperatures.add(temperature);
            this.systemPrompt = systemPrompt;
            this.userText = userText;
            if (failure != null) {
                throw failure;
            }
            return reply;
        }
    }

    /** 只覆盖温度解析，避免测试依赖人设推导细节。 */
    private static final class ExpressionStub extends CharacterExpressionService {

        private double temperature;

        ExpressionStub(double temperature) {
            super(new ObjectMapper());
            this.temperature = temperature;
        }

        @Override
        public double temperature(CharacterProfile character, ExpressionScene scene) {
            return temperature;
        }
    }

    private static final class SettingsStub extends UserLlmSettingsService {

        private double temperature;

        SettingsStub(double temperature) {
            super(null, null, null);
            this.temperature = temperature;
        }

        @Override
        public EffectiveLlmConfig effective(Long userId) {
            return new EffectiveLlmConfig(true, "http://localhost:9/v1", "key", "model", 256,
                    temperature, 30, "USER");
        }
    }

    /** 记录活动事件，避免触碰数据库。 */
    private static final class CapturingActivityService extends ActivityService {

        private final List<Recorded> recorded = new ArrayList<>();

        CapturingActivityService() {
            super(null, new ObjectMapper());
        }

        @Override
        public void record(Long userId, String eventType, String actor, String source,
                           Long conversationId, String turnId, String traceId,
                           Map<String, Object> payload) {
            recorded.add(new Recorded(userId, eventType, actor, source, conversationId, turnId,
                    new LinkedHashMap<>(payload)));
        }
    }

    private record Recorded(Long userId, String eventType, String actor, String source,
                            Long conversationId, String turnId, Map<String, Object> payload) {
    }
}
