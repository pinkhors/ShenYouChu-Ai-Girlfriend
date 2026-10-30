package com.shenyouchu.core.memory;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.memory.mapper.MemoryMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 删除记忆必须传播到派生数据（docs/20 §7.5 `forgotten`、验收 A-3）。
 *
 * <p>用 `java.lang.reflect.Proxy` 伪造 mapper / port，避免 Mockito 在受限沙箱下的
 * 管道限制，保证本用例在 CI 与本机都能跑。
 */
class MemoryServiceDeletePropagationTest {

    /** 记录 port 被调用的 (userId, sourceMessageId)；未被调用时保持 null。 */
    private static final class RecordingForgetPort implements MemoryForgetPort {
        private Long userId;
        private Long sourceMessageId;
        private int calls;

        @Override
        public int deleteBySourceMessage(Long userId, Long sourceMessageId) {
            this.userId = userId;
            this.sourceMessageId = sourceMessageId;
            this.calls += 1;
            return 1;
        }
    }

    /** 只实现 selectOne / deleteById 的 MemoryMapper 代理。 */
    private static MemoryMapper memoryMapperReturning(Memory row, AtomicLong deletedId) {
        InvocationHandler handler = (proxy, method, args) -> switch (method.getName()) {
            case "selectOne" -> row;
            case "deleteById" -> {
                if (deletedId != null && args != null && args.length > 0) {
                    deletedId.set(Long.parseLong(String.valueOf(args[0])));
                }
                yield 1;
            }
            default -> defaultValue(method.getReturnType());
        };
        return (MemoryMapper) Proxy.newProxyInstance(
                MemoryMapper.class.getClassLoader(),
                new Class<?>[]{MemoryMapper.class, BaseMapper.class},
                handler);
    }

    private static Object defaultValue(Class<?> type) {
        if (type == boolean.class) {
            return false;
        }
        if (type == int.class) {
            return 0;
        }
        if (type == long.class) {
            return 0L;
        }
        return null;
    }

    private static Memory memoryWithSource(Long sourceMessageId) {
        Memory memory = new Memory(1L, 2L, 3L, sourceMessageId, "preference", "他很喜欢看电影");
        /* 真实链路里这一行来自 selectOne，id 必然有值；实体没有 setId，用反射补齐以贴近真实。 */
        try {
            java.lang.reflect.Field id = Memory.class.getDeclaredField("id");
            id.setAccessible(true);
            id.set(memory, 10L);
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException("无法为测试 Memory 设置 id", ex);
        }
        return memory;
    }

    @Test
    void deletePropagatesToDerivedChunks() {
        RecordingForgetPort port = new RecordingForgetPort();
        AtomicLong deleted = new AtomicLong();
        MemoryService service = new MemoryService(
                memoryMapperReturning(memoryWithSource(88L), deleted), port);

        service.delete(1L, 10L);

        assertThat(deleted.get()).isEqualTo(10L);
        assertThat(port.calls).isEqualTo(1);
        assertThat(port.userId).isEqualTo(1L);
        assertThat(port.sourceMessageId).isEqualTo(88L);
    }

    @Test
    void deleteWithoutSourceMessageSkipsPropagation() {
        RecordingForgetPort port = new RecordingForgetPort();
        MemoryService service = new MemoryService(
                memoryMapperReturning(memoryWithSource(null), null), port);

        service.delete(1L, 10L);

        assertThat(port.calls).isZero();
    }

    @Test
    void deleteMissingMemoryThrowsNotFoundAndDoesNotPropagate() {
        RecordingForgetPort port = new RecordingForgetPort();
        MemoryService service = new MemoryService(memoryMapperReturning(null, null), port);

        assertThatThrownBy(() -> service.delete(1L, 404L))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("记忆不存在");
        assertThat(port.calls).isZero();
    }
}
