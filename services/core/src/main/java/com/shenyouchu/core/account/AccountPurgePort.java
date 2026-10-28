package com.shenyouchu.core.account;

/**
 * 账号删除时对各派生存储的清理接口。
 *
 * M1 只实现 MySQL 级联；Redis 会话、Milvus 向量、对象存储录像各自需要独立实现，
 * 在对应基础设施接入时注册为 Bean 即可，账号删除流程本身不需要改动。
 */
public interface AccountPurgePort {

    /** 清理该用户在某一类派生存储中的数据；实现必须幂等。 */
    void purge(Long userId);
}
