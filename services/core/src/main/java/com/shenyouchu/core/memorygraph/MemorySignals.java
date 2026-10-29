package com.shenyouchu.core.memorygraph;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 轻量话题 / 实体 / 分类抽取（P1 规则版，不调 LLM）。
 *
 * <p>目标不是“抽得全”，而是保证星图的边至少有“关于谁 / 关于什么”的语义。
 * 完整实体消歧与关系抽取在 P3。
 */
public final class MemorySignals {

    public static final String CATEGORY_FACT = "fact";
    public static final String CATEGORY_PROMISE = "promise";
    public static final String CATEGORY_EPISODE = "episode";
    public static final String CATEGORY_HABIT = "habit";

    private static final int MAX_TOPICS = 8;
    private static final int MAX_ENTITIES = 8;

    private static final List<String> PROMISE_WORDS = List.of(
            "约定", "答应", "说好", "以后", "下次", "保证", "不许", "别再", "一定会");
    private static final List<String> PREFERENCE_WORDS = List.of(
            "喜欢", "讨厌", "最爱", "偏好", "不喜欢", "不吃", "受不了", "习惯", "害怕", "想要");

    private static final Map<String, List<String>> TOPIC_LEXICON = new LinkedHashMap<>();

    static {
        TOPIC_LEXICON.put("工作", List.of("工作", "上班", "加班", "项目", "开会", "老板", "同事", "面试", "离职", "offer"));
        TOPIC_LEXICON.put("学习", List.of("学习", "考试", "复习", "作业", "论文", "上课", "老师", "毕业"));
        TOPIC_LEXICON.put("情绪", List.of("难过", "开心", "焦虑", "压力", "崩溃", "委屈", "生气", "孤独", "想你"));
        TOPIC_LEXICON.put("健康", List.of("生病", "感冒", "发烧", "医院", "吃药", "睡觉", "失眠", "头疼", "体检"));
        TOPIC_LEXICON.put("关系", List.of("妈妈", "爸爸", "家人", "朋友", "男朋友", "女朋友", "喜欢的人", "吵架", "和好"));
        TOPIC_LEXICON.put("生活", List.of("吃饭", "做饭", "搬家", "打扫", "快递", "房租", "水电", "通勤"));
        TOPIC_LEXICON.put("娱乐", List.of("电影", "音乐", "游戏", "追剧", "演唱会", "展览", "小说"));
        TOPIC_LEXICON.put("金钱", List.of("工资", "花钱", "存钱", "借钱", "账单", "奖金", "预算"));
        TOPIC_LEXICON.put("节日", List.of("生日", "纪念日", "春节", "中秋", "圣诞", "跨年", "情人节"));
        TOPIC_LEXICON.put("天气", List.of("下雨", "降温", "下雪", "台风", "太热", "太冷"));
        TOPIC_LEXICON.put("旅行", List.of("旅行", "旅游", "出差", "机票", "酒店", "海边", "爬山"));
        TOPIC_LEXICON.put("宠物", List.of("猫", "狗", "年糕", "宠物", "铲屎"));
    }

    private static final List<String> TITLE_WORDS = List.of(
            "妈妈", "爸爸", "爷爷", "奶奶", "外婆", "外公", "朋友", "同事", "老板", "老师",
            "同学", "室友", "男朋友", "女朋友", "猫", "狗");

    private static final Pattern DATE_DASH = Pattern.compile("\\d{4}-\\d{1,2}-\\d{1,2}");
    private static final Pattern DATE_CN = Pattern.compile("\\d{1,2}月\\d{1,2}[日号]");
    private static final Pattern QUOTED = Pattern.compile("[「“\"]([^」”\"]{1,20})[」”\"]");
    private static final Pattern NUMBER_UNIT = Pattern.compile(
            "\\d+(?:\\.\\d+)?\\s*(?:岁|年|天|周|个月|小时|分钟|次|元|块|点|分|公里|斤|杯)");

    private MemorySignals() {
    }

    public record Signals(String category, List<String> topics, List<String> entities) {
    }

    public static Signals analyze(String text) {
        String content = text == null ? "" : text;
        return new Signals(categoryOf(content), topicsOf(content), entitiesOf(content));
    }

    static String categoryOf(String text) {
        if (containsAny(text, PROMISE_WORDS)) {
            return CATEGORY_PROMISE;
        }
        if (containsAny(text, PREFERENCE_WORDS)) {
            return CATEGORY_FACT;
        }
        return CATEGORY_EPISODE;
    }

    static List<String> topicsOf(String text) {
        Set<String> topics = new LinkedHashSet<>();
        for (Map.Entry<String, List<String>> entry : TOPIC_LEXICON.entrySet()) {
            if (containsAny(text, entry.getValue())) {
                topics.add(entry.getKey());
                if (topics.size() >= MAX_TOPICS) {
                    break;
                }
            }
        }
        return List.copyOf(topics);
    }

    static List<String> entitiesOf(String text) {
        Set<String> entities = new LinkedHashSet<>();
        collect(entities, DATE_DASH, text);
        collect(entities, DATE_CN, text);
        collect(entities, NUMBER_UNIT, text);
        Matcher quoted = QUOTED.matcher(text);
        while (quoted.find() && entities.size() < MAX_ENTITIES) {
            entities.add(quoted.group(1).trim());
        }
        for (String title : TITLE_WORDS) {
            if (text.contains(title) && entities.size() < MAX_ENTITIES) {
                entities.add(title);
            }
        }
        return entities.stream().filter(value -> !value.isBlank()).limit(MAX_ENTITIES).toList();
    }

    private static void collect(Set<String> target, Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        while (matcher.find() && target.size() < MAX_ENTITIES) {
            target.add(matcher.group().trim());
        }
    }

    private static boolean containsAny(String text, List<String> words) {
        for (String word : words) {
            if (text.contains(word)) {
                return true;
            }
        }
        return false;
    }

    /** 节点标签：优先用户原话，去掉换行，最多 24 字。 */
    public static String summaryOf(String userText) {
        String value = userText == null ? "" : userText.replaceAll("\\s+", " ").trim();
        if (value.isEmpty()) {
            return "一条记忆";
        }
        return value.length() <= 24 ? value : value.substring(0, 24) + "…";
    }

    public static List<String> parseJsonList(String json, List<String> fallback) {
        if (json == null || json.isBlank()) {
            return fallback;
        }
        String trimmed = json.trim();
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
            return fallback;
        }
        String body = trimmed.substring(1, trimmed.length() - 1).trim();
        if (body.isEmpty()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (String part : body.split(",")) {
            String value = part.trim();
            if (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2) {
                value = value.substring(1, value.length() - 1);
            }
            if (!value.isBlank()) {
                values.add(value);
            }
        }
        return List.copyOf(values);
    }
}
