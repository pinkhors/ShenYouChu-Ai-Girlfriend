package com.shenyouchu.core.memorygraph.embedding;

public interface EmbeddingPort {

    Embedding embed(String text);

    record Embedding(String model, int dim, float[] vector) {
    }
}
