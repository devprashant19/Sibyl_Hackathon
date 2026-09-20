package com.sibyl.agent;

import net.bytebuddy.implementation.bind.annotation.Origin;
import net.bytebuddy.implementation.bind.annotation.RuntimeType;
import net.bytebuddy.implementation.bind.annotation.SuperCall;
import net.bytebuddy.implementation.bind.annotation.This;
import java.lang.reflect.Method;
import java.util.concurrent.Callable;

public class JdbcInterceptor {
    @RuntimeType
    public static Object intercept(@This Object target, @Origin Method method, @SuperCall Callable<?> callable) throws Exception {
        System.out.println("[Sibyl] Intercepted JDBC execution: " + target.getClass().getName() + "." + method.getName());
        
        // In a real implementation we would:
        // 1. Ask the SDK Orchestrator if we need to inject SLOW_IO or throw an Exception
        // 2. if (fault == SLOW_IO) Thread.sleep(delayMs);
        // 3. Record timeline event "DB -> method.getName() with args"
        
        // For the quickstart simulation, we blindly inject 150ms delay
        // if this is an UPDATE statement on products.
        String sql = target.toString(); // Weak heuristic for demonstration
        if (sql.contains("UPDATE products")) {
            System.out.println("[Sibyl] Injecting SLOW_IO fault on UPDATE...");
            Thread.sleep(150);
        }

        return callable.call();
    }
}
