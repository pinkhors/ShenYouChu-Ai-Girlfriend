package com.shenyouchu.core.expression;

/** 主动开口被阻塞的原因，按文档 09 §8.1 的顺序判定。 */
public enum ProactiveBlockReason {

    /** 允许开口。 */
    NONE,
    /** 隐私/活动记录关闭。 */
    PRIVACY_DISABLED,
    /** 用户正在通话/专注。 */
    USER_BUSY,
    /** 会话还没有任何用户消息。 */
    NO_HISTORY,
    /** 处于免打扰时段。 */
    QUIET_HOURS,
    /** 连续未回复达到上限。 */
    UNANSWERED_LIMIT,
    /** 今日主动消息数达到上限。 */
    DAILY_LIMIT,
    /** 用户最近 10 分钟内说过话。 */
    USER_JUST_REPLIED,
    /** 距上次主动消息不足冷却时长。 */
    COOLDOWN
}
