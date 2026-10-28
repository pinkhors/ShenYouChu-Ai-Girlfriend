package com.shenyouchu.core.turn.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TurnRequest(
        @NotBlank @Size(max = 2000) String message) {
}
