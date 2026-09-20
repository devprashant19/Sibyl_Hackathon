package com.sibyl.sdk;

import java.util.List;
import java.util.function.Predicate;
import java.util.stream.Collectors;

public class PromiseContext {
    private String runId;
    private List<Event> events;

    public PromiseContext(String runId, List<Event> events) {
        this.runId = runId;
        this.events = events;
    }

    public List<Event> timeline(Predicate<Event> filter) {
        return events.stream()
                .filter(filter)
                .collect(Collectors.toList());
    }

    public List<Event> getEvents() {
        return events;
    }
}
