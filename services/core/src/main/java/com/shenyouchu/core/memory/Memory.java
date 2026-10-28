package com.shenyouchu.core.memory;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shenyouchu.core.common.BaseEntity;

/** 长期记忆条目；M1 只保存确定性提取结果，语义召回在 P2 接入 Milvus。 */
@TableName("memories")
public class Memory extends BaseEntity {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long userId;

    private Long conversationId;

    private Long sourceMessageId;

    private String memoryType;

    private String content;

    private String status = "active";

    private String embeddingModel;

    private Integer embeddingDim;

    protected Memory() {
    }

    public Memory(Long userId, Long conversationId, Long sourceMessageId, String memoryType, String content) {
        this.userId = userId;
        this.conversationId = conversationId;
        this.sourceMessageId = sourceMessageId;
        this.memoryType = memoryType;
        this.content = content;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public Long getConversationId() {
        return conversationId;
    }

    public Long getSourceMessageId() {
        return sourceMessageId;
    }

    public String getMemoryType() {
        return memoryType;
    }

    public String getContent() {
        return content;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getEmbeddingModel() {
        return embeddingModel;
    }

    public Integer getEmbeddingDim() {
        return embeddingDim;
    }
}
