package com.shenyouchu.core.auth.dto;

import com.shenyouchu.core.user.User;

public record UserView(String id, String username, String role) {

    public static UserView from(User user) {
        return new UserView(user.getId(), user.getUsername(), user.getRole());
    }
}
