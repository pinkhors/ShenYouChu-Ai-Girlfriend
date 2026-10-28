package com.shenyouchu.core.account;

import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.RemoveObjectArgs;
import io.minio.Result;
import io.minio.messages.Item;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * S3 兼容对象存储清理：删除 `users/{userId}/` 前缀下的全部对象（录像等）。
 *
 * 使用 MinIO 客户端，可对接 MinIO 与部分 S3 兼容服务；阿里云 OSS 的 S3 兼容存在限制，
 * 生产接入前需按官方文档核验，必要时为 OSS 增加官方 SDK 适配器。
 */
@Component
@ConditionalOnProperty(name = "shenyouchu.storage.enabled", havingValue = "true")
public class S3AccountPurgePort implements AccountPurgePort {

    private static final Logger log = LoggerFactory.getLogger(S3AccountPurgePort.class);

    private final MinioClient client;
    private final String bucket;

    public S3AccountPurgePort(@Value("${shenyouchu.storage.endpoint:}") String endpoint,
                              @Value("${shenyouchu.storage.access-key:}") String accessKey,
                              @Value("${shenyouchu.storage.secret-key:}") String secretKey,
                              @Value("${shenyouchu.storage.bucket:}") String bucket) {
        this.bucket = bucket;
        this.client = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }

    @Override
    public void purge(Long userId) {
        String prefix = "users/" + userId + "/";
        int deleted = 0;
        try {
            Iterable<Result<Item>> objects = client.listObjects(ListObjectsArgs.builder()
                    .bucket(bucket)
                    .prefix(prefix)
                    .recursive(true)
                    .build());
            for (Result<Item> result : objects) {
                Item item = result.get();
                client.removeObject(RemoveObjectArgs.builder()
                        .bucket(bucket)
                        .object(item.objectName())
                        .build());
                deleted++;
            }
            log.info("Object storage purge finished for userId={}, deleted objects={}", userId, deleted);
        } catch (Exception ex) {
            log.warn("Object storage purge failed for userId={}: {}", userId, ex.getMessage());
        }
    }
}