package com.example.demo;

import com.sibyl.sdk.SibylPromise;
import java.util.List;

public class SibylConfig {

    public static List<SibylPromise> promises = List.of(
        SibylPromise.builder()
            .id("no-negative-inventory")
            .severity("CRITICAL")
            .description("Inventory must never drop below 0")
            .evaluate(ctx -> {
                return ctx.timeline(e -> e.getQuery().contains("UPDATE products"))
                          .stream()
                          .noneMatch(u -> (Integer) u.getArgs().get(0) < 0);
            })
            .build()
    );
}
