package com.sibyl.sdk;

import java.util.Map;
import java.util.List;

public class Event {
    private String domain;
    private String type;
    private Map<String, Object> payload;
    private long timestamp;

    public String getDomain() { return domain; }
    public String getType() { return type; }
    public Map<String, Object> getPayload() { return payload; }
    public long getTimestamp() { return timestamp; }

    public String getQuery() {
        if (payload != null && payload.containsKey("query")) {
            return (String) payload.get("query");
        }
        return "";
    }

    @SuppressWarnings("unchecked")
    public List<Object> getArgs() {
        if (payload != null && payload.containsKey("args")) {
            return (List<Object>) payload.get("args");
        }
        return List.of();
    }
}
