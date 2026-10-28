package com.shenyouchu.core.memory;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.common.ApiException;
import com.shenyouchu.core.memory.dto.MemoryView;
import com.shenyouchu.core.memory.mapper.MemoryMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 记忆写入与查询。M1 用确定性关键词规则做提取，保证链路可验证；
 * 后续替换为 LLM 提取 + Embedding 向量化（P2），接口保持不变。
 */
@Service
public class MemoryService {

    private static final int MIN_LENGTH = 6;
    private static final int MAX_CONTENT = 200;

    private static final List<String> PREFERENCE_WORDS = List.of("喜欢", "讨厌", "最爱", "偏好", "不喜欢");
    private static final List<String> EVENT_WORDS = List.of("今天", "昨天", "明天", "生日", "考试", "面试", "拿到", "发生");

    private final MemoryMapper memoryMapper;

    public MemoryService(MemoryMapper memoryMapper) {
        this.memoryMapper = memoryMapper;
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

    @Transactional
    public boolean rememberFromTurn(Long userId, Long conversationId, Long sourceMessageId, String userText) {
        String type = classify(userText);
        if (type == null) {
            return false;
        }
        String content = userText.trim();
        if (content.length() > MAX_CONTENT) {
            content = content.substring(0, MAX_CONTENT);
        }
        memoryMapper.insert(new Memory(userId, conversationId, sourceMessageId, type, content));
        return true;
    }

    @Transactional(readOnly = true)
    public List<MemoryView> list(Long userId) {
        return memoryMapper.selectList(Wrappers.<Memory>lambdaQuery()
                        .eq(Memory::getUserId, userId)
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
    }
}
