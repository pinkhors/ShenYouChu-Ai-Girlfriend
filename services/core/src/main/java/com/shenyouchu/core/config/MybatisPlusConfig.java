package com.shenyouchu.core.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.core.incrementer.DefaultIdentifierGenerator;
import com.baomidou.mybatisplus.core.incrementer.IdentifierGenerator;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MybatisPlusConfig {

    /** 插件顺序：分页 -> 乐观锁。租户插件不作为授权依据，见 ADR-0003。 */
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        return interceptor;
    }

    /**
     * 主键生成：MyBatis-Plus 雪花算法（见 ADR-0005）。
     * workerId/datacenterId 必须每个实例唯一，否则多实例部署会生成重复 ID；
     * 本地开发默认 1/1，生产由 SNOWFLAKE_WORKER_ID / SNOWFLAKE_DATACENTER_ID 注入。
     */
    @Bean
    public IdentifierGenerator identifierGenerator(
            @Value("${shenyouchu.id.worker-id:1}") long workerId,
            @Value("${shenyouchu.id.datacenter-id:1}") long datacenterId) {
        return new DefaultIdentifierGenerator(workerId, datacenterId);
    }
}
