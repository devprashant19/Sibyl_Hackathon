# sibyl-sdk (Java) — experimental

Early building blocks for a Java SDK. There is no Java orchestrator yet: the `sibyl` CLI runs
TypeScript configs only, nothing here runs a search or talks to the Sibyl API, and nothing is
published to Maven Central.

## Modules

- `sibyl-sdk` (`com.sibyl:sibyl-sdk`, no dependencies) — `SibylPromise` (builder with `id`,
  `description`, `severity`, `evaluate`), `PromiseContext` (`timeline(Predicate<Event>)`,
  `getEvents()`) and `Event`.
- `sibyl-agent` (`com.sibyl:sibyl-agent`, ByteBuddy, shaded) — a `-javaagent` that intercepts
  `execute`/`executeQuery`/`executeUpdate` on concrete `java.sql.PreparedStatement` classes. For the
  quickstart it unconditionally delays statements whose `toString()` contains `UPDATE products` by
  150ms; it does not consult any orchestrator.

## Build

```bash
cd packages/sdk-java
mvn install          # builds sibyl-sdk and the shaded sibyl-agent jar (Java 17+)
```

Without Maven, the SDK module compiles with plain `javac`:

```bash
javac --release 17 -d out $(find sibyl-sdk/src -name '*.java')
```

See `examples/quickstart` for a Spring Boot app run with the agent attached.
