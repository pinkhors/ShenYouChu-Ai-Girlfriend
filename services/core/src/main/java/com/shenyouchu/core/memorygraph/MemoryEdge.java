package com.shenyouchu.core.memorygraph;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shenyouchu.core.common.BaseEntity;

import java.math.BigDecimal;

/** 记忆之间的边：semantic（语义相近）/ temporal（同类时间相邻）/ recall（被召回）。 */
@TableName("memory_edges")
public class MemoryEdge extends BaseEntity {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long userId;
    private Long characterId;
    private Long sourceChunkId;
    private Long targetChunkId;
    private String edgeType;
    private BigDecimal weight;

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getCharacterId() {
        return characterId;
    }

    public void setCharacterId(Long characterId) {
        this.characterId = characterId;
    }

    public Long getSourceChunkId() {
        return sourceChunkId;
    }

    public void setSourceChunkId(Long sourceChunkId) {
        this.sourceChunkId = sourceChunkId;
    }

    public Long getTargetChunkId() {
        return targetChunkId;
    }

    public void setTargetChunkId(Long targetChunkId) {
        this.targetChunkId = targetChunkId;
    }

    public String getEdgeType() {
        return edgeType;
    }

    public void setEdgeType(String edgeType) {
        this.edgeType = edgeType;
    }

    public BigDecimal getWeight() {
        return weight;
    }

    public void setWeight(BigDecimal weight) {
        this.weight = weight;
    }
}
