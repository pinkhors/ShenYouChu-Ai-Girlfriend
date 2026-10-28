package com.shenyouchu.core.llm.settings;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.Instant;

/**
 * 用户级 LLM 配置：一个用户一行，user_id 即主键。
 *
 * api_key 只供服务端调用模型时使用，任何对外视图都不会返回；
 * 当前按明文保存，后续可迁移到加密列或密钥管理。
 */
@TableName("user_llm_settings")
public class UserLlmSettings {

    @TableId(value = "user_id", type = IdType.INPUT)
    private Long userId;

    private boolean enabled;

    private String baseUrl;

    private String model;

    private String apiKey;

    private int maxTokens;

    private double temperature;

    private int timeoutSeconds;

    /** 由数据库维护，只读。 */
    @TableField(value = "updated_at", insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private Instant updatedAt;

    protected UserLlmSettings() {
    }

    public UserLlmSettings(Long userId) {
        this.userId = userId;
        this.enabled = true;
        this.maxTokens = 512;
        this.temperature = 0.8;
        this.timeoutSeconds = 60;
    }

    public Long getUserId() {
        return userId;
    }

    /** MyBatis 结果映射需要 setter（主键为 INPUT，由 service 写入）。 */
    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = maxTokens;
    }

    public double getTemperature() {
        return temperature;
    }

    public void setTemperature(double temperature) {
        this.temperature = temperature;
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
    }

    public void setTimeoutSeconds(int timeoutSeconds) {
        this.timeoutSeconds = timeoutSeconds;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** 只读字段，仅为 MyBatis 结果映射提供 setter。 */
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
