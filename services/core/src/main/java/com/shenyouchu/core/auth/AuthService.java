package com.shenyouchu.core.auth;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.auth.dto.AuthResponse;
import com.shenyouchu.core.auth.dto.LoginRequest;
import com.shenyouchu.core.auth.dto.RegisterRequest;
import com.shenyouchu.core.auth.dto.UserView;
import com.shenyouchu.core.auth.mapper.UserSessionMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.security.AuthenticatedUser;
import com.shenyouchu.core.security.TokenHasher;
import com.shenyouchu.core.user.User;
import com.shenyouchu.core.user.mapper.UserMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private final UserMapper userMapper;
    private final UserSessionMapper userSessionMapper;
    private final PasswordEncoder passwordEncoder;
    private final ActivityService activityService;
    private final Duration sessionTtl;

    public AuthService(UserMapper userMapper,
                       UserSessionMapper userSessionMapper,
                       PasswordEncoder passwordEncoder,
                       ActivityService activityService,
                       @Value("${shenyouchu.auth.session-ttl:30d}") Duration sessionTtl) {
        this.userMapper = userMapper;
        this.userSessionMapper = userSessionMapper;
        this.passwordEncoder = passwordEncoder;
        this.activityService = activityService;
        this.sessionTtl = sessionTtl;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String username = request.username().trim();
        boolean exists = userMapper.exists(Wrappers.<User>lambdaQuery().eq(User::getUsername, username));
        if (exists) {
            throw ApiException.conflict("USERNAME_TAKEN", "用户名已被占用");
        }
        User user = new User(UUID.randomUUID().toString(), username, passwordEncoder.encode(request.password()));
        try {
            userMapper.insert(user);
        } catch (DuplicateKeyException ex) {
            throw ApiException.conflict("USERNAME_TAKEN", "用户名已被占用");
        }
        activityService.record(user.getId(), "auth.registered", "USER", "core", null, null, null,
                Map.of("username", username));
        return issueSession(user);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        User user = userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getUsername, request.username().trim()));
        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw ApiException.unauthenticated("用户名或密码错误");
        }
        if (!"active".equals(user.getStatus())) {
            throw ApiException.forbidden("账号不可用");
        }
        user.markLoggedIn();
        userMapper.updateById(user);
        activityService.record(user.getId(), "auth.login", "USER", "core", null, null, null, Map.of());
        return issueSession(user);
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        UserSession session = findByRawToken(rawToken).orElse(null);
        if (session == null) {
            return;
        }
        userSessionMapper.deleteById(session.getId());
        activityService.record(session.getUserId(), "auth.logout", "USER", "core", null, null, null, Map.of());
    }

    @Transactional(readOnly = true)
    public UserView me(String userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw ApiException.notFound("用户不存在");
        }
        return UserView.from(user);
    }

    /** 校验 token，返回当前用户；无效或过期返回 empty。 */
    @Transactional(readOnly = true)
    public Optional<AuthenticatedUser> authenticate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        UserSession session = findByRawToken(rawToken).orElse(null);
        if (session == null || session.isExpiredAt(Instant.now())) {
            return Optional.empty();
        }
        User user = userMapper.selectById(session.getUserId());
        if (user == null || !"active".equals(user.getStatus())) {
            return Optional.empty();
        }
        return Optional.of(new AuthenticatedUser(user.getId(), user.getUsername(), user.getRole()));
    }

    private AuthResponse issueSession(User user) {
        Instant expiresAt = Instant.now().plus(sessionTtl);
        String rawToken = TokenHasher.newToken();
        userSessionMapper.insert(new UserSession(
                UUID.randomUUID().toString(),
                user.getId(),
                TokenHasher.sha256Hex(rawToken),
                expiresAt));
        return new AuthResponse(rawToken, expiresAt, UserView.from(user));
    }

    private Optional<UserSession> findByRawToken(String rawToken) {
        return Optional.ofNullable(userSessionMapper.selectOne(
                Wrappers.<UserSession>lambdaQuery().eq(UserSession::getTokenHash, TokenHasher.sha256Hex(rawToken))));
    }
}
