package com.shenyouchu.core.memorygraph;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shenyouchu.core.memorygraph.dto.GraphEdgeView;
import com.shenyouchu.core.memorygraph.dto.MemoryGraphView;
import com.shenyouchu.core.memorygraph.embedding.EmbeddingPort;
import com.shenyouchu.core.memorygraph.embedding.EmbeddingService;
import com.shenyouchu.core.memorygraph.embedding.HashingEmbeddingClient;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class GraphProjectorTest {

    private final HashingEmbeddingClient hashing = new HashingEmbeddingClient();
    private final EmbeddingService embeddingService = new EmbeddingService(
            hashing, new ObjectMapper(), false, "", "", "test", 5);
    private final GraphProjector projector = new GraphProjector(embeddingService, 0.35, 5);

    @Test
    void projectsFourConstellationsAndOwnershipEdges() {
        List<MemoryChunk> chunks = List.of(
                chunk(1L, "我不吃香菜", MemorySignals.CATEGORY_FACT, null),
                chunk(2L, "我答应你下次早点睡", MemorySignals.CATEGORY_PROMISE, null),
                chunk(3L, "今天项目上线了，我加班到两点", MemorySignals.CATEGORY_EPISODE, null));

        MemoryGraphView view = projector.project(7L, 9L, "沈幼楚", chunks, 1, "incremental");

        assertThat(view.constellations()).hasSize(4);
        assertThat(view.nodes()).hasSize(3);
        assertThat(view.stats().nodes()).isEqualTo(3);
        assertThat(view.edges()).filteredOn(edge -> "ownership".equals(edge.kind())).hasSize(3);
        assertThat(view.layoutSeed()).isNotBlank();
    }

    @Test
    void identicalTextsProduceSemanticEdge() {
        String text = "我不吃香菜，闻到味道就难受";
        List<MemoryChunk> chunks = List.of(
                chunk(1L, text, MemorySignals.CATEGORY_FACT, null),
                chunk(2L, text, MemorySignals.CATEGORY_FACT, null));

        MemoryGraphView view = projector.project(7L, 9L, "沈幼楚", chunks, 1, "incremental");

        assertThat(view.edges())
                .filteredOn(edge -> "semantic".equals(edge.kind()))
                .hasSize(1);
    }

    @Test
    void ghostsAreCountedButDoNotJoinSemanticEdges() {
        List<MemoryChunk> chunks = List.of(
                chunk(1L, "我不吃香菜", MemorySignals.CATEGORY_FACT, null),
                chunk(2L, "我不吃香菜", MemorySignals.CATEGORY_FACT, Instant.now().minus(1, ChronoUnit.DAYS)));

        MemoryGraphView view = projector.project(7L, 9L, "沈幼楚", chunks, 2, "nightly");

        assertThat(view.stats().ghosts()).isEqualTo(1);
        assertThat(view.nodes()).filteredOn(node -> node.ghost()).hasSize(1);
        assertThat(view.edges())
                .filteredOn(edge -> "semantic".equals(edge.kind()))
                .isEmpty();
    }

    @Test
    void layoutIsDeterministic() {
        List<MemoryChunk> chunks = List.of(
                chunk(1L, "我不吃香菜", MemorySignals.CATEGORY_FACT, null),
                chunk(2L, "今天项目上线了", MemorySignals.CATEGORY_EPISODE, null));

        MemoryGraphView first = projector.project(7L, 9L, "沈幼楚", chunks, 1, "incremental");
        MemoryGraphView second = projector.project(7L, 9L, "沈幼楚", chunks, 2, "incremental");

        assertThat(first.nodes()).extracting(node -> node.id() + ":" + node.angle() + ":" + node.radius())
                .containsExactlyElementsOf(second.nodes().stream()
                        .map(node -> node.id() + ":" + node.angle() + ":" + node.radius())
                        .toList());
    }

    @Test
    void temporalEdgesLinkConsecutiveMemories() {
        List<MemoryChunk> chunks = List.of(
                chunk(1L, "周一项目启动", MemorySignals.CATEGORY_EPISODE, null),
                chunk(2L, "周三项目评审", MemorySignals.CATEGORY_EPISODE, null));

        MemoryGraphView view = projector.project(7L, 9L, "沈幼楚", chunks, 1, "incremental");

        assertThat(view.edges())
                .filteredOn(edge -> "temporal".equals(edge.kind()))
                .hasSize(1);
        GraphEdgeView edge = view.edges().stream()
                .filter(item -> "temporal".equals(item.kind()))
                .findFirst()
                .orElseThrow();
        assertThat(edge.source()).isLessThan(edge.target());
    }

    private MemoryChunk chunk(Long id, String text, String category, Instant invalidAt) {
        MemoryChunk chunk = new MemoryChunk();
        chunk.setId(id);
        chunk.setUserId(7L);
        chunk.setCharacterId(9L);
        chunk.setConversationId(11L);
        chunk.setChunkText(text);
        chunk.setSummary(MemorySignals.summaryOf(text));
        chunk.setCategory(category);
        chunk.setCreatedAt(Instant.now().minus(24 - id, ChronoUnit.HOURS));
        chunk.setInvalidAt(invalidAt);
        EmbeddingPort.Embedding embedding = hashing.embed(text);
        chunk.setEmbeddingModel(embedding.model());
        chunk.setEmbeddingDim(embedding.dim());
        chunk.setEmbeddingJson(embeddingService.toJson(embedding.vector()));
        return chunk;
    }
}
