package com.shenyouchu.core.relationship;

import com.shenyouchu.core.relationship.dto.CharacterStateView;

/** 关系状态视图转换与边界常量。 */
public final class RelationshipRules {

    public static final int MIN_MOOD = 0;
    public static final int MAX_MOOD = 100;
    public static final int MAX_INTIMACY = 100;

    private RelationshipRules() {
    }

    /** 心情变化：正向表达 +3，负向表达 -2，其余不因单句变化。 */
    public static int moodDelta(String text) {
        if (text == null) {
            return 0;
        }
        String value = text;
        if (containsAny(value, "喜欢", "开心", "哈哈", "太好了", "谢谢")) {
            return 3;
        }
        if (containsAny(value, "难过", "烦", "累", "哭", "生气", "讨厌")) {
            return -2;
        }
        return 0;
    }

    public static int clampMood(int value) {
        return Math.max(MIN_MOOD, Math.min(MAX_MOOD, value));
    }

    public static int clampIntimacy(int value) {
        return Math.max(0, Math.min(MAX_INTIMACY, value));
    }

    public static CharacterStateView toView(UserCharacterState state) {
        return new CharacterStateView(
                String.valueOf(state.getCharacterId()),
                state.getMood(),
                state.getIntimacy(),
                state.getStateVersion());
    }

    private static boolean containsAny(String text, String... words) {
        for (String word : words) {
            if (text.contains(word)) {
                return true;
            }
        }
        return false;
    }
}
