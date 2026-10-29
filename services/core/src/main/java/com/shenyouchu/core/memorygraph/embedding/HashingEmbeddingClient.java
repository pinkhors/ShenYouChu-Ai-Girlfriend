package com.shenyouchu.core.memorygraph.embedding;

import org.springframework.stereotype.Component;

/**
 * 离线兜底向量：字符 trigram 有符号哈希到 128 维并 L2 归一化。
 *
 * <p>它不是语义模型，只保证“同词/同短语更接近”，用于未配置 embedding 服务、
 * 单元测试与远端失败时降级；生产应打开 OpenAI 兼容 embedding。
 */
@Component
public class HashingEmbeddingClient implements EmbeddingPort {

    public static final String MODEL = "hash-trigram-128";
    public static final int DIM = 128;

    @Override
    public Embedding embed(String text) {
        float[] vector = new float[DIM];
        String value = text == null ? "" : text.trim();
        if (value.isEmpty()) {
            return new Embedding(MODEL, DIM, vector);
        }
        int length = value.length();
        if (length < 3) {
            add(vector, value);
        } else {
            for (int index = 0; index + 3 <= length; index++) {
                add(vector, value.substring(index, index + 3));
            }
        }
        normalize(vector);
        return new Embedding(MODEL, DIM, vector);
    }

    private static void add(float[] vector, String token) {
        int hash = token.hashCode();
        int bucket = Math.floorMod(hash, vector.length);
        vector[bucket] += (hash & 1) == 0 ? 1f : -1f;
    }

    private static void normalize(float[] vector) {
        double sum = 0;
        for (float value : vector) {
            sum += value * value;
        }
        double norm = Math.sqrt(sum);
        if (norm == 0) {
            return;
        }
        for (int index = 0; index < vector.length; index++) {
            vector[index] = (float) (vector[index] / norm);
        }
    }
}
