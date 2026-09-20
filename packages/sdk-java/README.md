# sibyl-sdk (Java)

The official Java SDK for the Sibyl chaos engineering platform.

## Installation

### Maven

```xml
<dependency>
  <groupId>dev.sibyl</groupId>
  <artifactId>sibyl-sdk</artifactId>
  <version>0.1.0</version>
</dependency>
```

### Gradle

```groovy
implementation 'dev.sibyl:sibyl-sdk:0.1.0'
```

## Quickstart

```java
import dev.sibyl.sdk.SibylPromise;
import dev.sibyl.sdk.PromiseContext;
import dev.sibyl.sdk.PromiseResult;

public class NoDoubleCharges implements SibylPromise {

    @Override
    public String id() { return "no-double-charges"; }

    @Override
    public String name() { return "No Double Charges"; }

    @Override
    public PromiseResult evaluate(PromiseContext ctx) {
        long chargeCount = ctx.timeline().stream()
            .filter(e -> "HTTP".equals(e.getDomain()))
            .filter(e -> "/v1/charges".equals(e.getMetadata().get("path")))
            .count();

        long uniqueKeys = ctx.timeline().stream()
            .filter(e -> "HTTP".equals(e.getDomain()))
            .map(e -> e.getMetadata().get("idempotencyKey"))
            .distinct()
            .count();

        if (chargeCount != uniqueKeys) {
            return PromiseResult.fail("Duplicate charge detected");
        }
        return PromiseResult.pass();
    }
}
```

## JUnit 5 Integration

```java
import dev.sibyl.sdk.junit.SibylExtension;
import dev.sibyl.sdk.junit.SibylTest;
import org.junit.jupiter.api.extension.ExtendWith;

@ExtendWith(SibylExtension.class)
public class CheckoutServiceTest {

    @SibylTest(
        iterations = 100,
        seed = "0xBEEF",
        strategy = "mcts",
        promises = { NoDoubleCharges.class }
    )
    void testCheckoutUnderFaults() {
        CheckoutService service = new CheckoutService();
        service.processPayment("order-123", 49.99);
    }
}
```

## Configuration

```yaml
# src/main/resources/sibyl.yml
sibyl:
  api-url: http://localhost:4000
  default-iterations: 200
  default-strategy: mcts
  drivers:
    - http
    - database
```

## Module Structure

```
sibyl-sdk/
├── src/main/java/dev/sibyl/sdk/
│   ├── SibylPromise.java          # Promise interface
│   ├── PromiseContext.java         # Evaluation context
│   ├── PromiseResult.java         # Result type
│   └── junit/
│       ├── SibylExtension.java    # JUnit 5 extension
│       └── SibylTest.java         # @SibylTest annotation
└── sibyl-agent/
    └── src/main/java/dev/sibyl/agent/
        └── SibylAgent.java        # Java agent for bytecode instrumentation
```

## Examples

See `examples/quickstart/` for a complete Spring Boot example.
