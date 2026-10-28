package com.shenyouchu.core.turn;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TurnCancellationRegistryTest {

    private final TurnCancellationRegistry registry = new TurnCancellationRegistry();

    @Test
    void ownerCanCancelActiveTurn() {
        registry.register("turn-1", 7L);

        assertThat(registry.cancel("turn-1", 7L)).isTrue();
        assertThat(registry.isCancelled("turn-1")).isTrue();
    }

    @Test
    void otherUserCannotCancel() {
        registry.register("turn-1", 7L);

        assertThat(registry.cancel("turn-1", 8L)).isFalse();
        assertThat(registry.isCancelled("turn-1")).isFalse();
    }

    @Test
    void unknownTurnIsNotCancellable() {
        assertThat(registry.cancel("missing", 7L)).isFalse();
        assertThat(registry.isCancelled("missing")).isFalse();
    }

    @Test
    void clearRemovesEntry() {
        registry.register("turn-1", 7L);
        registry.clear("turn-1");

        assertThat(registry.cancel("turn-1", 7L)).isFalse();
    }
}
