---
title: "Java 25: What's new in the latest LTS release"
description: "Java 25 is the new Long-Term Support release, shipping seven finalized language and library features alongside significant performance improvements. This post covers every JEP that matters for Java application developers."
pubDatetime: "2026-03-03T08:00:00+05:30"
tags:
  - java
  - java25
---

Java 25 shipped on September 16, 2025, as the next Long-Term Support release after Java 21. It brings 21 JEPs: seven finalized language and library features, a batch of performance-focused JEPs under Project Leyden, and a handful of preview features continuing their journey toward finalization.

For most teams, the upgrade path from Java 21 LTS to Java 25 LTS will be smoother than most major version jumps — there are no large compatibility breaks, and the finalized features are purely additive.

## Table of contents

## Finalized language features

### Compact source files and instance main methods — JEP 512

Java has long required a public class, a `public static void main(String[] args)` signature, and explicit imports before you could print a single line. This JEP — after four preview rounds — finally removes all of that ceremony.

A minimal Java 25 program:

```java
void main() {
    IO.println("Hello, Java 25!");
}
```

The rules:
- The file can omit the class declaration entirely — it is implicitly wrapped in one.
- `main()` can be an instance method (no `static` required).
- `String[] args` is optional.
- `IO.println()` is a new helper in `java.io.IO` for console output without `System.out`.

This is not a script language — it is still compiled Java, with access to all libraries, generics, and the full type system. The use case is education, quick prototyping, and small utility scripts.

Full class files still work unchanged. You opt in by simply omitting the boilerplate.

### Flexible constructor bodies — JEP 513

Before Java 25, calling `super()` or `this()` had to be the first statement in a constructor. This caused awkward workarounds when you needed to validate or transform arguments before delegating to the parent constructor.

**Before:**

```java
class PositiveRange {
    final int low;
    final int high;

    PositiveRange(int low, int high) {
        super();  // implicit, but conceptually must come first
        // validation can only happen after super() — which means the object
        // already exists in a potentially invalid state
        if (low < 0 || high < 0) throw new IllegalArgumentException("values must be positive");
        if (low > high) throw new IllegalArgumentException("low must be <= high");
        this.low = low;
        this.high = high;
    }
}
```

**After (Java 25):**

```java
class PositiveRange {
    final int low;
    final int high;

    PositiveRange(int low, int high) {
        // Validate BEFORE calling super — no awkward static helper workarounds
        if (low < 0 || high < 0) throw new IllegalArgumentException("values must be positive");
        if (low > high) throw new IllegalArgumentException("low must be <= high");
        super();
        this.low = low;
        this.high = high;
    }
}
```

You can also assign fields before `super()` — as long as you do not access `this` before the call:

```java
class CachedConnection extends BaseConnection {
    private final String poolName;

    CachedConnection(String poolName, String url) {
        this.poolName = poolName.toUpperCase();  // field assignment before super()
        super(url);
    }
}
```

This is a quality-of-life fix that removes a class of ugly static-helper workarounds that have been in codebases for decades.

### Module import declarations — JEP 511

Instead of listing individual imports from a module, you can now import the entire module at once:

```java
import module java.base;      // replaces dozens of java.util.*, java.io.* imports
import module java.sql;       // replaces java.sql.*, javax.sql.*
import module java.net.http;  // replaces java.net.http.*
```

A module import expands to all the public packages exported by that module. Conflicts (two modules exporting the same package) require a more specific import to resolve — same as today's wildcard import behavior.

This is particularly useful in combination with compact source files (JEP 512), where verbose imports are the main remaining source of noise in small programs:

```java
import module java.base;

void main() {
    var numbers = List.of(1, 2, 3, 4, 5);
    var sum = numbers.stream().mapToInt(Integer::intValue).sum();
    IO.println("Sum: " + sum);
}
```

In large codebases, explicit per-class imports remain better for readability. Module imports are most valuable in small files and educational contexts.

### Scoped values — JEP 506

Scoped values are the finalized alternative to `ThreadLocal` for passing contextual data (request user, transaction ID, tenant context) through a call chain without threading it through every method signature.

The key differences from `ThreadLocal`:
- **Immutable** — a scoped value cannot be mutated after binding, only re-bound in a child scope.
- **Bounded lifetime** — the value exists only within the `run()` / `call()` block. No `remove()` needed.
- **Inheritable by virtual threads** — works correctly with structured concurrency and virtual threads at scale.

```java
// Declare as a static constant (one per context "slot")
static final ScopedValue<RequestContext> REQUEST_CONTEXT = ScopedValue.newInstance();

// In your request handler:
ScopedValue.where(REQUEST_CONTEXT, new RequestContext(userId, tenantId))
    .run(() -> {
        validateRequest();   // calls REQUEST_CONTEXT.get() internally
        processPayment();    // calls REQUEST_CONTEXT.get() internally
        sendConfirmation();  // calls REQUEST_CONTEXT.get() internally
    });

// In any method in the call chain:
void processPayment() {
    RequestContext ctx = REQUEST_CONTEXT.get();  // always available, never null
    log("Processing payment for user " + ctx.userId());
}
```

Re-binding in a nested scope creates a child context without modifying the parent:

```java
ScopedValue.where(REQUEST_CONTEXT, adminContext)
    .run(() -> {
        // Override for this sub-operation only
        ScopedValue.where(REQUEST_CONTEXT, auditContext)
            .run(() -> writeAuditLog());
        // Back to adminContext here
        continueProcessing();
    });
```

If you are using `ThreadLocal` today to pass request-scoped data, scoped values are the modern replacement. They are especially important when migrating to virtual threads, where `ThreadLocal` can cause memory pressure at scale.

### Key Derivation Function API — JEP 510

The `javax.crypto.KDF` API provides a standard interface for key derivation algorithms, starting with HKDF (HMAC-based Key Derivation Function, RFC 5869) — the most widely used KDF in TLS, SSH, and modern key exchange protocols.

```java
// Derive an AES key from a shared secret (e.g., from ECDH key agreement)
KDF hkdf = KDF.getInstance("HKDF-SHA256");

byte[] sharedSecret = /* result of Diffie-Hellman or similar */;
byte[] salt = /* random salt */;
byte[] info = "com.example.myapp.v1".getBytes(StandardCharsets.UTF_8);

SecretKey aesKey = hkdf.deriveKey(
    "AES",
    HKDFParameterSpec.ofExtract(salt, sharedSecret)
                     .thenExpand(info, 32)
);
```

Before this API, HKDF required either a third-party library (Bouncy Castle) or several screens of boilerplate using raw `Mac` operations. Now it is a single `getInstance()` call using the standard JCA provider framework.

## Performance and runtime improvements

### Compact object headers — JEP 519

Every Java object has a header the JVM uses to store the object's class pointer, identity hash code, and GC metadata. On 64-bit JVMs with compressed oops, this header has historically been 12–16 bytes.

JEP 519 compresses it to 8 bytes. No code change is required — the change is internal to the JVM. The benefits are proportional to how many objects your application creates:

- **Reduced heap usage** — 8 bytes per object adds up quickly at scale. A heap with 100 million live objects saves ~400 MB of header overhead.
- **Better cache utilisation** — smaller objects fit more tightly in cache lines, improving traversal performance on graphs and collections.

The feature is enabled by default. To disable it: `-XX:-UseCompactObjectHeaders`.

Workloads most likely to see measurable improvement: microservices with high request rates, graph-heavy data structures, and applications that create many small DTOs or value objects.

### Generational Shenandoah — JEP 521

Shenandoah GC has been available since Java 12 as a low-pause collector, but it treated all objects equally regardless of age. JEP 521 adds generational awareness — separating short-lived objects (young generation) from long-lived ones (old generation) — which reduces the amount of work done on each GC cycle.

Enable it with:

```bash
java -XX:+UseShenandoahGC YourApp
```

Generational mode is now the default when Shenandoah is active. For applications already using Shenandoah, this should reduce GC overhead without any configuration change.

If you are currently on ZGC (which became generational-by-default in Java 21), the two collectors are now broadly comparable. Run your own benchmarks — the right choice depends on your workload.

### Ahead-of-Time compilation ergonomics — JEPs 514 and 515

Project Leyden's AOT work continues in Java 25 with two ergonomics improvements:

**AOT command-line ergonomics (JEP 514):** Simplifies the workflow for recording and replaying AOT profiles. The old multi-step process of profiling a run and then compiling is now a single flag:

```bash
# Record a profile
java -XX:AOTMode=record -XX:AOTConfiguration=app.aotconf -jar app.jar

# Use the profile on subsequent runs
java -XX:AOTMode=on -XX:AOTConfiguration=app.aotconf -jar app.jar
```

**AOT method profiling (JEP 515):** Profile data (which methods are hot, how often branches are taken) is now available immediately at startup from a prior run, rather than being re-collected cold on each JVM launch. This shrinks the warm-up window for AOT-compiled code.

These are most useful for CLI tools, short-lived microservices, and Lambda-style functions where startup time matters.

## Preview features

Preview features require `--enable-preview` to use. They are subject to change before finalization.

### Stable values — JEP 502 (Preview)

`StableValue<T>` is a container for a value that is computed exactly once, on first access, and then treated as a constant by the JIT compiler.

```java
// Traditional lazy initialization — verbose and error-prone
private volatile ExpensiveService service;
ExpensiveService getService() {
    if (service == null) {
        synchronized (this) {
            if (service == null) {
                service = new ExpensiveService(config);
            }
        }
    }
    return service;
}

// Java 25 preview: StableValue
private final StableValue<ExpensiveService> service = StableValue.of();

ExpensiveService getService() {
    return service.orElseSet(() -> new ExpensiveService(config));
}
```

Because the JIT knows the value will never change after the first write, it can constant-fold reads and eliminate null checks — similar to `final` fields but with deferred initialization.

`StableList`, `StableMap`, and `StableSupplier` variants are also provided for collections and supplier-style access patterns.

### Primitive types in patterns — JEP 507 (Third Preview)

Pattern matching in `instanceof` and `switch` has worked with reference types since Java 16. This JEP extends it to primitive types.

```java
// instanceof with primitives
Object value = getValueFromSomewhere();
if (value instanceof int i) {
    System.out.println("int: " + i);
} else if (value instanceof long l) {
    System.out.println("long: " + l);
}

// switch with primitive patterns and guards
switch (score) {
    case int i when i >= 90 -> grade = "A";
    case int i when i >= 80 -> grade = "B";
    case int i when i >= 70 -> grade = "C";
    case int i             -> grade = "F";
}
```

Narrowing conversions that could lose data are allowed only when the value fits in the target type at runtime:

```java
long bigNumber = 1_000_000L;
long smallNumber = 42L;

if (bigNumber instanceof int i) {
    // not reached — 1_000_000 does not fit in int
}
if (smallNumber instanceof int i) {
    IO.println("fits: " + i);  // reached — 42 fits in int
}
```

This closes a long-standing inconsistency where `switch` over an `int` could not use pattern syntax while `switch` over `Integer` (the boxed type) could.

### Structured concurrency — JEP 505 (Fifth Preview)

Structured concurrency treats a group of concurrent tasks as a single unit of work: if any task fails, the others are cancelled; if the scope exits, all tasks have either completed or been cancelled.

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Supplier<User>  user  = scope.fork(() -> userService.fetch(userId));
    Supplier<Order> order = scope.fork(() -> orderService.fetch(orderId));

    scope.join().throwIfFailed();

    return new ResponseDto(user.get(), order.get());
}
```

The fifth preview refines the API surface but does not change the core model. If you are using it in production today (behind `--enable-preview`), check the release notes for API changes before upgrading — preview features can have breaking changes between previews.

Once finalized, structured concurrency will be the standard way to write fan-out / gather patterns with virtual threads.

### PEM encodings — JEP 470 (Preview)

PEM (Privacy Enhanced Mail) is the `-----BEGIN CERTIFICATE-----` format used everywhere in TLS configuration, SSH keys, and certificate handling. Java has never had a standard API for reading and writing it — developers relied on Bouncy Castle or large amounts of boilerplate involving `Base64` and `X509EncodedKeySpec`.

```java
// Read a PEM-encoded private key
String pemKey = Files.readString(Path.of("server.key"));
PrivateKey privateKey = (PrivateKey) PEMDecoder.of().decode(pemKey).get(0).key();

// Read a PEM-encoded certificate
String pemCert = Files.readString(Path.of("server.crt"));
X509Certificate cert = (X509Certificate) PEMDecoder.of().decode(pemCert).get(0).certificate();

// Write a key back to PEM format
String pem = PEMEncoder.of().encodeToString(privateKey);
```

This reduces what used to be 15–20 lines of boilerplate to 1–3 lines. The preview API will likely stabilise in Java 26 or 27.

## JDK removals and deprecations

- **JEP 503 — Remove the 32-bit x86 Port:** The 32-bit Linux/x86 port is removed. 64-bit builds are unaffected.
- **Unsafe memory-access methods:** `sun.misc.Unsafe` memory-access methods continue their deprecation march. The replacement (`java.lang.foreign.MemorySegment` from the Foreign Function & Memory API, finalized in Java 22) should be used in new code.

## Feature summary

| JEP | Feature | Status |
|---|---|---|
| JEP 512 | Compact source files and instance main methods | Finalized |
| JEP 513 | Flexible constructor bodies | Finalized |
| JEP 511 | Module import declarations | Finalized |
| JEP 506 | Scoped values | Finalized |
| JEP 510 | Key Derivation Function API | Finalized |
| JEP 519 | Compact object headers | Finalized |
| JEP 521 | Generational Shenandoah | Finalized |
| JEP 514 | AoT command-line ergonomics | Finalized |
| JEP 515 | AoT method profiling | Finalized |
| JEP 518 | JFR cooperative sampling | Finalized |
| JEP 520 | JFR method timing and tracing | Finalized |
| JEP 502 | Stable values | Preview |
| JEP 507 | Primitive types in patterns | Third Preview |
| JEP 505 | Structured concurrency | Fifth Preview |
| JEP 470 | PEM encodings of cryptographic objects | Preview |
| JEP 508 | Vector API | Tenth Incubator |
| JEP 503 | Remove 32-bit x86 port | Removed |

## Upgrading from Java 21

Java 25 is the next LTS. The upgrade checklist for most applications:

1. **Test with `--enable-preview` off** — all finalized features are available by default with no flags.
2. **Run your test suite** — no large compatibility breaks, but verify library compatibility.
3. **Check Unsafe usage** — if your dependencies use `sun.misc.Unsafe`, check for deprecation warnings.
4. **Evaluate scoped values** — if you use `ThreadLocal` for request context, consider migrating to scoped values, especially if you are moving to virtual threads.
5. **Enable compact object headers** — it is on by default; monitor heap metrics to confirm the expected reduction.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> If you are still on Java 17 LTS, Java 25 is an excellent upgrade target. The language has improved significantly since 17: records, sealed classes, pattern matching in switch, virtual threads, sequenced collections, and now scoped values and flexible constructors — all stable and production-ready.</p>
</blockquote>

## References

- <a href="https://openjdk.org/projects/jdk/25/" target="_blank" rel="noopener" referrerpolicy="origin">JDK 25 — OpenJDK</a>
- <a href="https://www.infoq.com/news/2025/09/java25-released/" target="_blank" rel="noopener" referrerpolicy="origin">Java 25 Released — InfoQ</a>
- <a href="https://www.oracle.com/java/technologies/javase/25all-relnotes.html" target="_blank" rel="noopener" referrerpolicy="origin">JDK 25 Release Notes — Oracle</a>
- <a href="https://www.happycoders.eu/java/java-25-features/" target="_blank" rel="noopener" referrerpolicy="origin">Java 25 Features with Examples — HappyCoders</a>
