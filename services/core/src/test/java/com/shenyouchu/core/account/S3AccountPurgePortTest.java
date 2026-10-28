package com.shenyouchu.core.account;

import io.minio.BucketExistsArgs;
import io.minio.ListObjectsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.Result;
import io.minio.messages.Item;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 对象存储清理的集成测试：需要本地 MinIO（full profile）。
 * MinIO 不可用时整类跳过（Assumptions），不会让离线环境构建失败。
 */
class S3AccountPurgePortTest {

    private static final String ENDPOINT = System.getenv().getOrDefault("STORAGE_ENDPOINT", "http://127.0.0.1:49000");
    private static final String ACCESS_KEY = System.getenv().getOrDefault("STORAGE_ACCESS_KEY", "sycminio");
    private static final String SECRET_KEY = System.getenv().getOrDefault("STORAGE_SECRET_KEY", "syc_dev_minio");
    private static final String BUCKET = System.getenv().getOrDefault("STORAGE_BUCKET", "shenyouchu");

    private final MinioClient admin = MinioClient.builder()
            .endpoint(ENDPOINT)
            .credentials(ACCESS_KEY, SECRET_KEY)
            .build();

    @Test
    void purgeDeletesOnlyThatUsersPrefix() throws Exception {
        Assumptions.assumeTrue(reachable(), "local MinIO not reachable, skipping object storage test");
        if (!admin.bucketExists(BucketExistsArgs.builder().bucket(BUCKET).build())) {
            admin.makeBucket(MakeBucketArgs.builder().bucket(BUCKET).build());
        }

        long victim = 990001L;
        long neighbour = 990002L;
        put(victim, "users/" + victim + "/recordings/a.mp4");
        put(neighbour, "users/" + neighbour + "/recordings/b.mp4");

        new S3AccountPurgePort(ENDPOINT, ACCESS_KEY, SECRET_KEY, BUCKET).purge(victim);

        assertThat(list(victim)).isEmpty();
        assertThat(list(neighbour)).containsExactly("users/" + neighbour + "/recordings/b.mp4");

        admin.removeObject(io.minio.RemoveObjectArgs.builder()
                .bucket(BUCKET)
                .object("users/" + neighbour + "/recordings/b.mp4")
                .build());
    }

    private boolean reachable() {
        try {
            admin.bucketExists(BucketExistsArgs.builder().bucket(BUCKET).build());
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    private void put(long userId, String object) throws Exception {
        byte[] payload = "test".getBytes(StandardCharsets.UTF_8);
        admin.putObject(PutObjectArgs.builder()
                .bucket(BUCKET)
                .object(object)
                .stream(new ByteArrayInputStream(payload), payload.length, -1)
                .contentType("video/mp4")
                .build());
    }

    private java.util.List<String> list(long userId) throws Exception {
        java.util.List<String> names = new java.util.ArrayList<>();
        for (Result<Item> item : admin.listObjects(ListObjectsArgs.builder()
                .bucket(BUCKET)
                .prefix("users/" + userId + "/")
                .recursive(true)
                .build())) {
            names.add(item.get().objectName());
        }
        return names;
    }
}