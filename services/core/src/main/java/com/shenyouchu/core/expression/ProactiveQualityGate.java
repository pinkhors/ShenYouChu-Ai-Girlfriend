package com.shenyouchu.core.expression;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

/**
 * 主动消息生成后的质量闸门（文档 09 §8.5）。
 *
 * <p>顺序：空白 → 超长 → 多问号 → 重复 → 隐私索取。任一失败都由调用方决定
 * 是否降温度重试；本类只做纯判定。
 */
public final class ProactiveQualityGate {

    private static final int MAX_CHARS = 120;
    private static final int RECENT_WINDOW = 3;
    private static final int DUPLICATE_LENGTH_GAP = 10;

    private static final List<String> PRIVACY_WORDS =
            List.of("身份证", "银行卡", "密码", "住址", "手机号");

    public QualityVerdict check(String text, List<String> recentAssistantTexts) {
        if (text == null || text.isBlank()) {
            return new QualityVerdict(false, "EMPTY");
        }
        if (charCount(text) > MAX_CHARS) {
            return new QualityVerdict(false, "TOO_LONG");
        }
        if (questionMarkCount(text) > 1) {
            return new QualityVerdict(false, "TOO_MANY_QUESTIONS");
        }
        if (isDuplicate(text, recentAssistantTexts)) {
            return new QualityVerdict(false, "DUPLICATE");
        }
        if (containsPrivacyWord(text)) {
            return new QualityVerdict(false, "PRIVACY_SOLICITATION");
        }
        return new QualityVerdict(true, "OK");
    }

    private static boolean isDuplicate(String text, List<String> recentAssistantTexts) {
        if (recentAssistantTexts == null || recentAssistantTexts.isEmpty()) {
            return false;
        }
        String normalizedText = normalize(text);
        int from = Math.max(0, recentAssistantTexts.size() - RECENT_WINDOW);
        for (int index = from; index < recentAssistantTexts.size(); index++) {
            String recent = recentAssistantTexts.get(index);
            if (recent == null || recent.isBlank()) {
                continue;
            }
            String normalizedRecent = normalize(recent);
            if (normalizedRecent.isEmpty()) {
                continue;
            }
            if (normalizedText.equals(normalizedRecent)) {
                return true;
            }
            int gap = Math.abs(charCount(normalizedText) - charCount(normalizedRecent));
            if (gap <= DUPLICATE_LENGTH_GAP
                    && (normalizedText.contains(normalizedRecent) || normalizedRecent.contains(normalizedText))) {
                return true;
            }
        }
        return false;
    }

    private static boolean containsPrivacyWord(String text) {
        for (String word : PRIVACY_WORDS) {
            if (text.contains(word)) {
                return true;
            }
        }
        return false;
    }

    private static int questionMarkCount(String text) {
        int count = 0;
        for (int index = 0; index < text.length(); ) {
            int codePoint = text.codePointAt(index);
            if (codePoint == '?' || codePoint == '？') {
                count++;
            }
            index += Character.charCount(codePoint);
        }
        return count;
    }

    private static int charCount(String text) {
        return text.codePointCount(0, text.length());
    }

    /**
     * 归一化：NFKC + 小写 + 去掉空白与标点，用于判断“说的是不是同一句话”。
     */
    private static String normalize(String text) {
        String normalized = Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder builder = new StringBuilder(normalized.length());
        for (int index = 0; index < normalized.length(); ) {
            int codePoint = normalized.codePointAt(index);
            if (!isIgnorable(codePoint)) {
                builder.appendCodePoint(codePoint);
            }
            index += Character.charCount(codePoint);
        }
        return builder.toString();
    }

    private static boolean isIgnorable(int codePoint) {
        if (Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint)) {
            return true;
        }
        return switch (Character.getType(codePoint)) {
            case Character.CONNECTOR_PUNCTUATION,
                 Character.DASH_PUNCTUATION,
                 Character.START_PUNCTUATION,
                 Character.END_PUNCTUATION,
                 Character.INITIAL_QUOTE_PUNCTUATION,
                 Character.FINAL_QUOTE_PUNCTUATION,
                 Character.OTHER_PUNCTUATION -> true;
            default -> false;
        };
    }
}
