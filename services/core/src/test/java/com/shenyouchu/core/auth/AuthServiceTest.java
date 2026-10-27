package com.shenyouchu.core.auth;

import com.shenyouchu.core.activity.ActivityService;
import com.shenyouchu.core.auth.dto.AuthResponse;
import com.shenyouchu.core.auth.dto.LoginRequest;
import com.shenyouchu.core.auth.dto.RegisterRequest;
import com.shenyouchu.core.auth.mapper.UserSessionMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.security.TokenHasher;
import com.shenyouchu.core.user.User;
import com.shenyouchu.core.user.mapper.UserMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserMapper userMapper;
    @Mock
    private UserSessionMapper userSessionMapper;
    @Mock
    private ActivityService activityService;

    private PasswordEncoder passwordEncoder;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder();
        authService = new AuthService(userMapper, userSessionMapper, passwordEncoder, activityService, Duration.ofDays(30));
    }

    @Test
    void registerStoresHashedPasswordAndReturnsToken() {
        when(userMapper.exists(any())).thenReturn(false);

        AuthResponse response = authService.register(new RegisterRequest("shenyouchu", "password123"));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(captor.capture());
        User stored = captor.getValue();
        assertThat(stored.getPasswordHash()).isNotEqualTo("password123");
        assertThat(passwordEncoder.matches("password123", stored.getPasswordHash())).isTrue();
        assertThat(response.token()).isNotBlank();
        assertThat(response.user().username()).isEqualTo("shenyouchu");
    }

    @Test
    void loginRejectsWrongPassword() {
        User user = new User("u-1", "shenyouchu", passwordEncoder.encode("right-password"));
        when(userMapper.selectOne(any())).thenReturn(user);

        assertThatThrownBy(() -> authService.login(new LoginRequest("shenyouchu", "wrong-password")))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("用户名或密码错误");
    }

    @Test
    void authenticateUsesTokenHashLookup() {
        User user = new User("u-1", "shenyouchu", passwordEncoder.encode("password123"));
        UserSession session = new UserSession("s-1", "u-1",
                TokenHasher.sha256Hex("raw-token"), java.time.Instant.now().plusSeconds(60));
        when(userSessionMapper.selectOne(any())).thenReturn(session);
        when(userMapper.selectById("u-1")).thenReturn(user);

        assertThat(authService.authenticate("raw-token")).isPresent()
                .get().extracting("userId").isEqualTo("u-1");
    }
}
