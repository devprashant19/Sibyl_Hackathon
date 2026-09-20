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
            // Concrete driver classes only: interfaces and abstract methods have no super call to delegate to.
            .type(ElementMatchers.hasSuperType(ElementMatchers.named("java.sql.PreparedStatement"))
                .and(ElementMatchers.not(ElementMatchers.isInterface())))
            .transform((builder, type, classLoader, module, domain) -> builder
                .method(ElementMatchers.named("execute")
                        .or(ElementMatchers.named("executeQuery"))
                        .or(ElementMatchers.named("executeUpdate"))
                        .and(ElementMatchers.not(ElementMatchers.isAbstract())))
                .intercept(MethodDelegation.to(JdbcInterceptor.class))
            )
            .installOn(inst);

        System.out.println("[Sibyl] Java Agent installed successfully.");
    }
}
