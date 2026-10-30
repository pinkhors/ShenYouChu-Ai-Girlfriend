package com.shenyouchu.core.memory;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.memory.dto.MemoryView;
import com.shenyouchu.core.memory.mapper.MemoryMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 记忆写入与查询。M1 用确定性关键词规则做提取，保证链路可验证；
 * 后续替换为 LLM 提取 + Embedding 向量化（P2），接口保持不变。
 *
 * <p>记忆挂角色：写入时由会话带入 character_id；列表可按角色筛选，避免跨角色串记忆。
 *
 * <p>删除（{@link #delete}）是**真删**：除了本表记录，还通过 {@link MemoryForgetPort}
 * 把派生数据（星图 chunk / 边 / 召回记录）一起清掉，保证"删了就不再被召回"
 * （docs/20 §7.5 `forgotten`、验收 A-3）。这与星图上的"忘记"（写 invalid_at、
 * 保留幽灵星）是两种语义，不能互相替代。
 */
@Service
public class MemoryService {

    private static final Logger log = LoggerFactory.getLogger(MemoryService.class);

    private static final int MIN_LENGTH = 6;
    private static final int MAX_CONTENT = 200;

    private static final List<String> PREFERENCE_WORDS = List.of("喜欢", "讨厌", "最爱", "偏好", "不喜欢");
    private static final List<String> EVENT_WORDS = List.of("今天", "昨天", "明天", "生日", "考试", "面试", "拿到", "发生");

    private final MemoryMapper memoryMapper;
    private final MemoryForgetPort forgetPort;

    public MemoryService(MemoryMapper memoryMapper, MemoryForgetPort forgetPort) {
        this.memoryMapper = memoryMapper;
        this.forgetPort = forgetPort;
    }

    /** 返回识别出的记忆类型；不足以成为记忆时返回 null。 */
    static String classify(String userText) {
        if (userText == null) {
            return null;
        }
        String text = userText.trim();
        if (text.length() < MIN_LENGTH) {
            return null;
        }
        if (PREFERENCE_WORDS.stream().anyMatch(text::contains)) {
            return "preference";
        }
        if (EVENT_WORDS.stream().anyMatch(text::contains)) {
            return "event";
        }
        return null;
    }

    /** 兼容旧调用：没有角色上下文时 character_id 留空。 */
    @Transactional
    public boolean rememberFromTurn(Long userId, Long conversationId, Long sourceMessageId, String userText) {
        return rememberFromTurn(userId, conversationId, null, sourceMessageId, userText);
    }

    /** 一轮对话写入记忆：characterId 从会话带入。 */
    @Transactional
    public boolean rememberFromTurn(Long userId, Long conversationId, Long characterId,
                                    Long sourceMessageId, String userText) {
        String type = classify(userText);
        if (type == null) {
            return false;
        }
        String content = userText.trim();
        if (content.length() > MAX_CONTENT) {
            content = content.substring(0, MAX_CONTENT);
        }
        memoryMapper.insert(new Memory(userId, characterId, conversationId, sourceMessageId, type, content));
        return true;
    }

    @Transactional(readOnly = true)
    public List<MemoryView> list(Long userId) {
        return list(userId, null);
    }

    /** characterId 可选：只返回该角色的记忆；不传则返回当前用户全部记忆。 */
    @Transactional(readOnly = true)
    public List<MemoryView> list(Long userId, Long characterId) {
        return memoryMapper.selectList(Wrappers.<Memory>lambdaQuery()
                        .eq(Memory::getUserId, userId)
                        .eq(characterId != null, Memory::getCharacterId, characterId)
                        .orderByDesc(Memory::getCreatedAt))
                .stream()
                .map(MemoryView::from)
                .toList();
    }

    @Transactional
    public void delete(Long userId, Long memoryId) {
        Memory memory = memoryMapper.selectOne(Wrappers.<Memory>lambdaQuery()
                .eq(Memory::getId, memoryId)
                .eq(Memory::getUserId, userId));
        if (memory == null) {
            throw ApiException.notFound("记忆不存在");
        }
        memoryMapper.deleteById(memory.getId());
        /* 真删：把派生 chunk/边/召回记录一起清掉，否则下一轮仍可能被召回（docs/20 A-3）。
           source_message_id 为空的历史数据无法定位 chunk，仅删本表记录并记日志。 */
        if (memory.getSourceMessageId() == null) {
            log.debug("删除记忆时缺少 source_message_id，跳过派生清理 user={} memory={}", userId, memoryId);
        } else {
            forgetPort.deleteBySourceMessage(userId, memory.getSourceMessageId());
        }
    }
}