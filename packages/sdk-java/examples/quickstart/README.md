# Sibyl Java SDK Quickstart

This example demonstrates how to integrate Sibyl into a standard Spring Boot / Hibernate application using the ByteBuddy `-javaagent`.

## 1. The Application Bug
In `DemoApplication.java`, we have an endpoint `POST /api/checkout`. 
It uses `@Transactional(isolation = Isolation.READ_COMMITTED)` but crucially forgets to use pessimistic locking (`PESSIMISTIC_WRITE`) on the `findById` call. Under concurrency, this is a Time-of-Check to Time-of-Use (TOCTOU) race condition.

## 2. Integration
Instead of modifying your application code, you attach the Sibyl agent when running the JVM:
```bash
java -javaagent:../../sibyl-agent/target/sibyl-agent-0.1.0-SNAPSHOT.jar -jar target/demo-0.0.1-SNAPSHOT.jar
```
The agent rewrites concrete `PreparedStatement` classes at load time to intercept `execute`, `executeQuery` and `executeUpdate`.

## 3. The Promise
In `SibylConfig.java`, we use the fluent `SibylPromise.builder()` API to declare our invariant with strong generic typing:
```java
return ctx.timeline(e -> e.getQuery().contains("UPDATE products"))
          .stream()
          .noneMatch(u -> (Integer) u.getArgs().get(0) < 0);
```

## 4. Running

There is no Java orchestrator yet, so the `sibyl` CLI cannot run this example, and the promise in
`SibylConfig.java` is not evaluated by anything. To see the widened race window by hand:

```bash
(cd ../.. && mvn install)            # installs com.sibyl:sibyl-sdk and builds the agent jar
mvn clean package
java -javaagent:../../sibyl-agent/target/sibyl-agent-0.1.0-SNAPSHOT.jar -jar target/demo-0.0.1-SNAPSHOT.jar
```

The agent delays every `UPDATE products` statement by 150ms, so concurrent `POST /api/checkout`
requests read the same inventory and overwrite each other's update.
