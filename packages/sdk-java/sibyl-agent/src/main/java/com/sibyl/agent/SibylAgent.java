package com.sibyl.agent;

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.implementation.MethodDelegation;
import net.bytebuddy.matcher.ElementMatchers;

import java.lang.instrument.Instrumentation;

public class SibylAgent {

    public static void premain(String arg, Instrumentation inst) {
        System.out.println("[Sibyl] Java Agent attaching via premain...");

        new AgentBuilder.Default()
            // Intercept standard JDBC PreparedStatement execution
            .type(ElementMatchers.hasSuperType(ElementMatchers.named("java.sql.PreparedStatement")))
            .transform((builder, type, classLoader, module, domain) -> builder
                .method(ElementMatchers.named("execute")
                        .or(ElementMatchers.named("executeQuery"))
                        .or(ElementMatchers.named("executeUpdate")))
                .intercept(MethodDelegation.to(JdbcInterceptor.class))
            )
            .installOn(inst);

        System.out.println("[Sibyl] Java Agent installed successfully.");
    }
}
