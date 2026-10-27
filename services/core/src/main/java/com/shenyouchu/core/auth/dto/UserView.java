package com.shenyouchu.core.auth.dto;

import com.shenyouchu.core.user.User;

/**
 * 对外用户视图：ID 以字符串返回，避免 JavaScript 端丢失雪花 ID 精度（见 ADR-0005）。
 */
public record UserView(String id, String username, String role) {

    public static UserView from(User user) {
        return new UserView(String.valueOf(user.getId()), user.getUsername(), user.getRole());
    }
}
