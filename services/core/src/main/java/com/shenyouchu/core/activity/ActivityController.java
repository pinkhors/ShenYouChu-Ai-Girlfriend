package com.shenyouchu.core.activity;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.shenyouchu.core.activity.dto.ActivityEventView;
import com.shenyouchu.core.activity.mapper.ActivityEventMapper;
import com.shenyouchu.core.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/activity-events")
public class ActivityController {

    private final ActivityEventMapper activityEventMapper;

    public ActivityController(ActivityEventMapper activityEventMapper) {
        this.activityEventMapper = activityEventMapper;
    }

    @GetMapping
    public List<ActivityEventView> list(@RequestParam(required = false) String type,
                                        @RequestParam(defaultValue = "50") int limit) {
        Long userId = CurrentUser.require().userId();
        int safeLimit = Math.min(Math.max(limit, 1), 200);
        return activityEventMapper.selectList(Wrappers.<ActivityEvent>lambdaQuery()
                        .eq(ActivityEvent::getUserId, userId)
                        .eq(type != null && !type.isBlank(), ActivityEvent::getEventType, type)
                        .orderByDesc(ActivityEvent::getOccurredAt)
                        .last("LIMIT " + safeLimit))
                .stream()
                .map(ActivityEventView::from)
                .toList();
    }
}
