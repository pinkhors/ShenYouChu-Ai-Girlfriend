package com.shenyouchu.core.security;

/** 认证后的当前用户，只来自服务端会话校验结果。 */
public record AuthenticatedUser(String userId, String username, String role) {
}
