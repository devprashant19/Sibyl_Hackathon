package com.sibyl.sdk;

import java.util.function.Function;

public class SibylPromise {
    private String id;
    private String description;
    private String severity;
    private Function<PromiseContext, Boolean> evaluateFn;

    private SibylPromise(Builder builder) {
        this.id = builder.id;
        this.description = builder.description;
        this.severity = builder.severity;
        this.evaluateFn = builder.evaluateFn;
    }

    public static Builder builder() {
        return new Builder();
    }

    public boolean evaluate(PromiseContext ctx) {
        return evaluateFn.apply(ctx);
    }

    public static class Builder {
        private String id;
        private String description = "";
        private String severity = "CRITICAL";
        private Function<PromiseContext, Boolean> evaluateFn;

        public Builder id(String id) { this.id = id; return this; }
        public Builder description(String desc) { this.description = desc; return this; }
        public Builder severity(String sev) { this.severity = sev; return this; }
        public Builder evaluate(Function<PromiseContext, Boolean> fn) { this.evaluateFn = fn; return this; }

        public SibylPromise build() {
            if (id == null || evaluateFn == null) {
                throw new IllegalStateException("ID and evaluate function are required.");
            }
            return new SibylPromise(this);
        }
    }
}
