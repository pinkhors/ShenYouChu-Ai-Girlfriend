package com.shenyouchu.core.memorygraph;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 只为本模块开启调度；夜间校准见 {@link MemoryGraphScheduler}。 */
@Configuration
@EnableScheduling
public class MemoryGraphSchedulingConfig {
}
