package com.shenyouchu.core.security;

import com.shenyouchu.core.common.ApiException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** 从安全上下文读取当前用户；调用方不得接受客户端传入的 userId。 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static AuthenticatedUser require() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return user;
        }
        throw ApiException.unauthenticated("未认证或凭证已失效");
    }
}
