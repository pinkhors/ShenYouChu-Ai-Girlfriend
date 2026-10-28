package com.shenyouchu.core.account;

import com.shenyouchu.core.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/account")
public class AccountController {

    private final AccountDeletionService accountDeletionService;

    public AccountController(AccountDeletionService accountDeletionService) {
        this.accountDeletionService = accountDeletionService;
    }

    /** 删除当前账号：MySQL 数据逻辑删除、会话立即失效；派生存储由清理端口处理。 */
    @PostMapping("/deletion")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAccount() {
        accountDeletionService.deleteAccount(CurrentUser.require().userId());
    }
}
