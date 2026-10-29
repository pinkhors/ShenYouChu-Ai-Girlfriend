package com.shenyouchu.core.character;

import com.shenyouchu.core.character.dto.FamilyView;
import com.shenyouchu.core.character.dto.PersonalityView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 角色设定的服务端白名单与文案目录（纯逻辑，无 Spring 依赖）。
 *
 * <p>这里的 ID 必须与前端 characterTypes.ts 的选项一一对应；未知 ID 一律由
 * CharacterValidator 以 CHARACTER_OPTION_INVALID 拒绝，客户端无法提交任意提示词。
 * <p>提示词只由服务端编译（CharacterPromptCompiler），目录中的描述是唯一来源。
 */
public final class CharacterCatalog {

    public static final int MIN_NAME = 2;
    public static final int MAX_NAME = 12;
    public static final int MIN_AGE = 18;
    public static final int MAX_AGE = 45;
    public static final int MAX_INTRO = 40;
    public static final int MAX_EXTRA_NOTE = 60;
    public static final int MAX_ADDRESS = 6;
    public static final int MAX_MODIFIERS = 2;
    public static final int MAX_CUSTOM_CHARACTERS = 12;
    /** 形象 JSON 上限 8KB。 */
    public static final int MAX_AVATAR_BYTES = 8 * 1024;

    /** 官方沈幼楚默认形象，与前端 DEFAULT_AVATAR（avatarConfig.ts）逐字段一致。 */
    public static final String DEFAULT_AVATAR_JSON = "{"
            + "\"skinTone\":\"natural\","
            + "\"hairStyle\":\"long-straight\","
            + "\"hairColor\":\"black\","
            + "\"faceShape\":0.6,"
            + "\"eyeColor\":\"dark\","
            + "\"eyeSize\":0.55,"
            + "\"eyeSpacing\":0.5,"
            + "\"browStyle\":\"soft\","
            + "\"lipColor\":\"rose\","
            + "\"lipFullness\":0.5,"
            + "\"blush\":0.35,"
            + "\"outfitStyle\":\"casual\","
            + "\"outfitColor\":\"cream\","
            + "\"accessory\":\"none\""
            + "}";

    public static final PersonalityView DEFAULT_PERSONALITY =
            new PersonalityView("gentle", List.of(), "medium", "medium", "你", "我", "medium");

    public static final FamilyView DEFAULT_FAMILY =
            new FamilyView("city", "polite", "ordinary", "");

    /** 复制官方沈幼楚时映射出的结构化人设（文档 §3.5.1）。 */
    public static final PersonalityView OFFICIAL_COPY_PERSONALITY =
            new PersonalityView("gentle", List.of("soft-tsundere"), "medium", "medium", "你", "我", "medium");

    /** 官方角色复制后的中性家庭背景（文档 §3.5.1）。 */
    public static final FamilyView OFFICIAL_COPY_FAMILY =
            new FamilyView("city", "polite", "ordinary", "");

    /** 主性格：ID → {标签, 提示词描述}。 */
    private static final Map<String, Option> ARCHETYPES = optionMap(
            "gentle", "温柔治愈", "温柔治愈：先接住情绪再慢慢说，关心藏在细节里，不逼问；语气缓、少感叹号、句子偏短，生气时先软下来说自己的感受，不翻旧账",
            "tsundere", "傲娇嘴硬", "傲娇嘴硬：关心藏在反话里，嘴上嫌弃、行动照顾，被戳穿会害羞；多用反问、省略号和口是心非，别扭一会儿后会直说在意",
            "lively", "活泼元气", "活泼元气：主动找话题，情绪有感染力；用短句、拟声词和感叹号，逗你开心、分享小事，生气时当场说开不冷战",
            "cool", "清冷慢热", "清冷慢热：话少但认真，熟悉后很直球；安静陪着、记住细节、少说多做，先沉默消化再给一句很直的回应",
            "intellectual", "知性从容", "知性从容：讲逻辑也讲感受，喜欢分享见闻；帮你拆问题、给新角度，先承认情绪再讲道理，不说教",
            "lazy", "慵懒松弛", "慵懒松弛：节奏慢、爱赖床但不黏人；慢悠悠拖长音，用玩笑化解，懒得吵时会直接说现在不想谈这个",
            "reliable", "认真可靠", "认真可靠：记得细节，会提醒和规划；条理清楚、少夸张，具体地帮你安排吃饭睡觉，认真沟通给方案但不控制",
            "whimsical", "古灵精怪", "古灵精怪：爱开玩笑、脑洞大；说话跳脱、比喻多、爱接梗，用奇怪比喻逗你或制造小惊喜，冲突时先搞笑缓和再认真道歉");

    /** 调味标签：ID → {标签, 提示词描述}。 */
    private static final Map<String, Option> MODIFIERS = optionMap(
            "soft-tsundere", "小傲娇", "偶尔嘴硬，关心藏在反话里，但不刻薄",
            "affectionate", "爱撒娇", "更常说想你、要抱抱，但会看场合",
            "slow-warm", "慢热", "初期客气，熟悉后反差大",
            "teasing", "爱吐槽", "轻松调侃，不拿痛处开玩笑",
            "attentive", "细心", "记得你说过的小事，会主动提起",
            "romantic", "浪漫", "重视仪式感、纪念日和小惊喜",
            "independent", "独立", "有自己的生活，不查岗、不黏人",
            "clingy", "黏人", "喜欢贴贴和报备，但尊重你的边界");

    /** 家庭成长环境：ID → {标签, 提示词描述}。 */
    private static final Map<String, Option> GROWTHS = optionMap(
            "small-town", "小城慢生活", "小城慢生活（熟人社会、节奏慢、离自然近，重视人情与小确幸）",
            "city", "都市长大", "都市长大（独立、见多识广、习惯快节奏，边界感强、适应快）",
            "county", "乡镇/县城", "乡镇/县城（家庭纽带强、生活务实，节俭、看重承诺）",
            "overseas", "异乡/海外", "异乡/海外（跨文化成长、搬家经历，独立又想要归属感）",
            "mobile", "经常搬迁", "经常搬迁（适应力强但不易交心，对稳定有隐秘渴望）");

    /** 家庭关系：ID → {标签, 提示词描述}。 */
    private static final Map<String, Option> RELATIONS = optionMap(
            "close", "亲密支持", "家庭关系亲密支持（和父母像朋友，遇事会商量）",
            "polite", "平淡客气", "家庭关系平淡客气（关心彼此但少深谈，需要被温和引导）",
            "apart", "聚少离多", "家庭聚少离多（父母忙碌或异地，习惯自己扛，不擅长求助）",
            "single-parent", "单亲/重组", "家庭是单亲或重组（早熟，对承诺敏感、重视稳定，不喜欢被比较）",
            "strained", "关系紧张", "家庭关系紧张（与家人有隔阂、渴望被理解，冲突时容易先退让，不卖惨不指责家人）");

    /** 经济状况：ID → {标签, 提示词描述}。 */
    private static final Map<String, Option> ECONOMIES = optionMap(
            "tight", "拮据", "经济拮据（精打细算、对价格敏感，更看重心意、不愿占便宜）",
            "ordinary", "普通", "经济普通（收支平衡、务实，偶尔为喜欢的东西小小奢侈，对朋友大方）",
            "comfortable", "小康", "经济小康（生活从容，愿意为体验花钱，重视生活质量但不炫耀）",
            "wealthy", "优渥", "经济优渥（物质无忧、见过好东西，对理所当然敏感，更看重真诚与边界）");

    public static final Set<String> SELF_REF_IDS =
            new LinkedHashSet<>(List.of("我", "人家", "本小姐", "姐姐", "name"));

    public static final Set<String> OUTFIT_STYLES =
            new LinkedHashSet<>(List.of("casual", "knit", "campus", "commute", "home", "vintage", "sporty"));

    private static final Set<String> LEVELS = new LinkedHashSet<>(List.of("low", "medium", "high"));

    private static final Map<String, String> INTENSITY_LABELS =
            Map.of("low", "克制", "medium", "自然", "high", "明显");
    private static final Map<String, String> INITIATIVE_LABELS =
            Map.of("low", "慢热", "medium", "适中", "high", "主动");
    private static final Map<String, String> JEALOUSY_LABELS =
            Map.of("low", "低", "medium", "中", "high", "高");

    private CharacterCatalog() {
    }

    private record Option(String label, String prompt) {
    }

    private static Map<String, Option> optionMap(String... entries) {
        Map<String, Option> map = new LinkedHashMap<>();
        for (int index = 0; index + 2 < entries.length; index += 3) {
            map.put(entries[index], new Option(entries[index + 1], entries[index + 2]));
        }
        return Map.copyOf(map);
    }

    public static Set<String> archetypeIds() {
        return ARCHETYPES.keySet();
    }

    public static Set<String> modifierIds() {
        return MODIFIERS.keySet();
    }

    public static Set<String> growthIds() {
        return GROWTHS.keySet();
    }

    public static Set<String> relationsIds() {
        return RELATIONS.keySet();
    }

    public static Set<String> economyIds() {
        return ECONOMIES.keySet();
    }

    public static Set<String> levelIds() {
        return LEVELS;
    }

    public static String archetypeLabel(String id) {
        Option option = ARCHETYPES.get(id);
        return option == null ? "" : option.label();
    }

    public static String archetypePrompt(String id) {
        Option option = ARCHETYPES.get(id);
        return option == null ? ARCHETYPES.get("gentle").prompt() : option.prompt();
    }

    public static String modifierLabel(String id) {
        Option option = MODIFIERS.get(id);
        return option == null ? "" : option.label();
    }

    public static String modifierPrompt(String id) {
        Option option = MODIFIERS.get(id);
        return option == null ? "" : option.label() + "：" + option.prompt();
    }

    public static String growthLabel(String id) {
        Option option = GROWTHS.get(id);
        return option == null ? "" : option.label();
    }

    public static String growthPrompt(String id) {
        Option option = GROWTHS.get(id);
        return option == null ? GROWTHS.get("city").prompt() : option.prompt();
    }

    public static String relationsLabel(String id) {
        Option option = RELATIONS.get(id);
        return option == null ? "" : option.label();
    }

    public static String relationsPrompt(String id) {
        Option option = RELATIONS.get(id);
        return option == null ? RELATIONS.get("polite").prompt() : option.prompt();
    }

    public static String economyLabel(String id) {
        Option option = ECONOMIES.get(id);
        return option == null ? "" : option.label();
    }

    public static String economyPrompt(String id) {
        Option option = ECONOMIES.get(id);
        return option == null ? ECONOMIES.get("ordinary").prompt() : option.prompt();
    }

    public static String intensityLabel(String id) {
        return INTENSITY_LABELS.getOrDefault(id, INTENSITY_LABELS.get("medium"));
    }

    public static String initiativeLabel(String id) {
        return INITIATIVE_LABELS.getOrDefault(id, INITIATIVE_LABELS.get("medium"));
    }

    public static String jealousyLabel(String id) {
        return JEALOUSY_LABELS.getOrDefault(id, JEALOUSY_LABELS.get("medium"));
    }

    /**
     * 角色卡标签：主性格 + 调味标签 + 成长环境 + 经济状况，最多 4 个
     * （与前端 tagsForDraft 保持一致）。
     */
    public static List<String> customTags(PersonalityView personality, FamilyView family) {
        List<String> tags = new ArrayList<>(4);
        if (personality != null) {
            addTag(tags, archetypeLabel(personality.archetype()));
            if (personality.modifiers() != null) {
                personality.modifiers().forEach(id -> addTag(tags, modifierLabel(id)));
            }
        }
        if (family != null) {
            addTag(tags, growthLabel(family.growth()));
            addTag(tags, economyLabel(family.economy()));
        }
        return List.copyOf(tags);
    }

    private static void addTag(List<String> tags, String label) {
        if (tags.size() >= 4 || label == null || label.isBlank() || tags.contains(label)) {
            return;
        }
        tags.add(label);
    }
}
