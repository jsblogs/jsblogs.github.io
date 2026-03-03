---
title: "GraalVM native image with Spring Boot 4 — startup gains, build costs, and when it's worth it"
description: "GraalVM native image can cut Spring Boot startup from seconds to milliseconds and halve memory usage. Spring Boot 4 ships improved AOT support and requires GraalVM 25. This post covers the real performance numbers, every meaningful limitation, and a decision guide for when native is worth the build complexity."
pubDatetime: "2026-03-03T10:30:00+05:30"
tags:
  - springboot
  - spring
  - java
  - graalvm
---

A Spring Boot service on the JVM typically starts in 3–8 seconds. In a container that scales to zero between requests — a serverless function, a CLI tool, or a Kubernetes deployment that cold-starts under traffic — those seconds matter. GraalVM native image compiles your application to a standalone binary that starts in under 100 milliseconds and uses a fraction of the memory.

Spring Boot 4 improves the AOT engine that makes this possible and requires GraalVM 25. The gains are real. So are the costs. This post covers both honestly.

## Table of contents

## What GraalVM native image does

A traditional Spring Boot application ships as a JAR and runs on a JVM. The JVM interprets bytecode, JIT-compiles hot paths, loads classes on demand, and builds up performance over time. That warm-up period is where startup time comes from.

GraalVM native image works differently: it compiles your entire application — Spring framework, your code, and all dependencies — into a single, platform-specific binary ahead of time. No JVM ships with it. The binary starts immediately because everything has already been analysed, optimised, and linked.

The trade-off is a fundamental constraint called the **closed-world assumption**: at compile time, GraalVM must be able to see every class, method, and resource that will ever be used at runtime. Anything it cannot see statically gets removed. Anything Java typically discovers dynamically — through reflection, class loading, or runtime proxies — must be declared explicitly or it will not be present.

Spring Boot's AOT engine exists specifically to solve this problem for the Spring ecosystem.

## How Spring Boot 4's AOT engine works

Spring's entire programming model is built on dynamic features: bean definitions discovered at startup, `@Configuration` classes enhanced with proxies, `@Value` and `@Autowired` resolved via reflection. None of these are visible to a static GraalVM analysis by default.

Spring Boot's AOT (Ahead-of-Time) processing runs during the build — before GraalVM compiles anything — and transforms your application into a form that GraalVM can fully analyse:

**1. Source code generation:** `@Configuration` classes are rewritten into plain factory code that creates bean definitions without reflection or proxies.

```java
// What you write
@Configuration(proxyBeanMethods = false)
public class PaymentConfig {
    @Bean
    public PaymentService paymentService(PaymentRepository repo) {
        return new PaymentService(repo);
    }
}

// What AOT generates (simplified) — pure method calls, no reflection
public class PaymentConfig__BeanDefinitions {
    static BeanDefinition getPaymentServiceBeanDefinition() {
        RootBeanDefinition def = new RootBeanDefinition(PaymentService.class);
        def.setInstanceSupplier(ctx ->
            new PaymentService(ctx.getBean(PaymentRepository.class)));
        return def;
    }
}
```

**2. Hint file generation:** AOT produces JSON configuration files in `META-INF/native-image/` that tell GraalVM which classes need reflection, which resources must be included, which proxies to generate, and which serialization types to preserve.

**3. Proxy generation:** AOP proxies and `@Configuration` class enhancements are generated at build time rather than runtime.

The result: GraalVM receives a fully analysable representation of your application. Spring Boot 4 improved this engine — it handles more conditional beans, produces smaller hint files, and integrates more cleanly with GraalVM 25's updated analysis capabilities.

## Build setup

**Requirements:**
- Spring Boot 4.0+
- GraalVM 25 (or compatible build environment — Docker buildpacks handle this automatically)
- Maven or Gradle with the native plugin

The `spring-boot-starter-parent` BOM already includes native image plugin management. You only need to declare the plugin:

```xml
<!-- pom.xml -->
<build>
    <plugins>
        <plugin>
            <groupId>org.graalvm.buildtools</groupId>
            <artifactId>native-maven-plugin</artifactId>
        </plugin>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
        </plugin>
    </plugins>
</build>
```

**Option 1 — local GraalVM (faster iteration):**

```bash
# Install GraalVM 25 (e.g. via SDKMAN)
sdk install java 25-graalce

# Compile to native binary
./mvnw -Pnative native:compile

# Run it
./target/my-app
```

**Option 2 — Docker buildpacks (no local GraalVM needed):**

```bash
# Builds a container image using Paketo buildpacks with GraalVM
./mvnw -Pnative spring-boot:build-image

# The result is a ready-to-deploy container
docker run --rm -p 8080:8080 my-app:1.0.0
```

The buildpack option is slower on the first run but requires no local GraalVM installation, which matters for CI pipelines and teams that do not want GraalVM as a local dev dependency.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use <code>./mvnw spring-boot:run</code> with the standard JVM during development. Only run <code>native:compile</code> in CI or when validating the native build. The JVM round-trip is seconds; native compilation is minutes.</p>
</blockquote>

## The performance numbers

These are representative figures for a mid-sized Spring Boot REST API (10–20 beans, database connection, one or two REST controllers):

| Metric | JVM (standard) | Native image |
|---|---|---|
| Startup time | 3–8 seconds | 50–150 ms |
| RSS memory at idle | 200–400 MB | 50–120 MB |
| Peak throughput (sustained) | Higher (JIT kicks in) | Lower |
| Binary / container size | ~300 MB (JVM included) | 60–100 MB |
| Build time | 5–15 seconds | 5–15 minutes |

The startup improvement is real and consistent — native image typically starts 20–60× faster than a JVM baseline. The memory reduction is also consistent: 2–4× lower resident set size.

Peak throughput is the exception. The JVM's JIT compiler optimises hot paths based on runtime profiling data. A native image uses profile-guided optimisation only if you explicitly collect and feed profile data at compile time. For long-running workloads where throughput per second matters more than startup time, the JVM still wins.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> These numbers vary significantly by application. A service with heavy use of reflection-based libraries (certain ORM features, dynamic proxying, runtime code generation) will see smaller gains and higher build complexity. Benchmark your specific application before committing to native image in production.</p>
</blockquote>

## The real costs

### Build time

Native compilation is slow. A small Spring Boot application compiles natively in 3–5 minutes. A medium-sized service with many dependencies can take 10–15 minutes. A large monolith-style service can exceed 20 minutes.

This makes the inner development loop impractical on native image. The standard workflow is:

- **Development:** JVM mode, hot reload with DevTools, fast restarts
- **CI:** Native image build to verify compatibility and produce the production artifact
- **Production:** Native binary deployed in a container

If your CI pipeline runs native builds on every commit, budget for significantly longer pipelines or parallelize native and JVM builds separately.

### Increased memory usage during the build

The native image compilation process itself is memory-intensive. For a medium Spring Boot application, GraalVM's `native-image` tool commonly uses 6–12 GB of heap during compilation. CI runners with 4 GB RAM will fail or thrash. Allocate at least 8 GB to the build machine.

```bash
# Increase build memory if needed
export JAVA_TOOL_OPTIONS="-Xmx12g"
./mvnw -Pnative native:compile
```

### Debugging

The JVM offers rich runtime debugging: JVMTI-based profilers, JFR, heap dumps, thread dumps, dynamic class reloading. Most of these are not available in a native binary because the JVM is not present.

Native images support GDB-style debugging (via DWARF debug info) and basic JFR event recording, but the tooling ecosystem is thinner. Production incidents in native images are harder to diagnose than their JVM equivalents.

## The closed-world limitations in practice

The closed-world assumption creates real restrictions that affect typical Spring Boot patterns:

### Dynamic bean registration at runtime

You cannot programmatically register beans after the application context starts. `BeanDefinitionRegistryPostProcessor` and `BeanFactory.registerSingleton()` patterns that add beans dynamically at startup may not work correctly in native image.

```java
// Works on JVM — may fail in native image
@Component
class DynamicRegistrar implements BeanDefinitionRegistryPostProcessor {
    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        // Registering beans based on runtime classpath scanning — not AOT-safe
        registry.registerBeanDefinition("myBean", new RootBeanDefinition(MyBean.class));
    }
}
```

### Profile restrictions

Profiles that are activated at runtime (via environment variable or command-line argument) work correctly. What does not work is using profiles to conditionally include bean classes that are absent from the classpath in one profile but present in another, or switching which beans exist based on a profile activated after the binary is built.

```yaml
# This works — the same beans exist in all profiles, just configured differently
spring:
  profiles:
    active: prod

---
spring.config.activate.on-profile: prod
spring.datasource.url: jdbc:postgresql://prod-db:5432/mydb

---
spring.config.activate.on-profile: staging
spring.datasource.url: jdbc:postgresql://staging-db:5432/mydb
```

### Reflection

Any class accessed via reflection at runtime must be declared in the native image configuration. Spring Boot's AOT engine handles this automatically for all Spring-managed beans. The places where you need to intervene are:

- Custom serialization/deserialization with Jackson for types that AOT does not see
- Libraries that use reflection internally (e.g. some mapping frameworks)
- Your own use of `Class.forName()` or `Method.invoke()`

## Declaring reflection hints

For types that need reflection support, Spring Boot provides several mechanisms:

**Annotation-based (simplest):**

```java
// Tell AOT that this class needs reflection support for binding
@RegisterReflectionForBinding(OrderDto.class)
@Configuration
public class JacksonConfig { ... }
```

**Programmatic hints (for complex cases):**

```java
@Component
public class MyReflectionHints implements RuntimeHintsRegistrar {

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        // Register a class for full reflection (all methods, fields, constructors)
        hints.reflection().registerType(
            TypeReference.of(LegacyDto.class),
            MemberCategory.values()
        );

        // Register a specific resource file to be included in the binary
        hints.resources().registerPattern("templates/email/*.html");
    }
}
```

```java
// Register the registrar with Spring
@ImportRuntimeHints(MyReflectionHints.class)
@SpringBootApplication
public class MyApplication { ... }
```

**Testing hints coverage:**

Spring Boot provides a test slice that runs your AOT configuration against a real native image:

```java
@SpringBootTest
@NativeTest
class NativeImageSmokeTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void healthEndpointResponds() throws Exception {
        mockMvc.perform(get("/actuator/health"))
            .andExpect(status().isOk());
    }
}
```

`@NativeTest` builds and runs the actual native binary rather than the JVM version of the application. Add these tests in CI to catch missing hints before production.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Missing reflection hints fail silently during build and loudly at runtime — with <code>ClassNotFoundException</code> or <code>NoSuchMethodException</code> that do not appear in JVM tests. Always run <code>@NativeTest</code> smoke tests in CI for every native image build.</p>
</blockquote>

## Library compatibility

Most major Spring ecosystem libraries support native image out of the box in Spring Boot 4:

| Library | Native support |
|---|---|
| Spring Data JPA (Hibernate 7) | ✓ Full |
| Spring Data Redis | ✓ Full |
| Spring Data MongoDB | ✓ Full |
| Spring Security | ✓ Full |
| Spring Batch | ✓ Full |
| Spring AMQP (RabbitMQ) | ✓ Full |
| Spring Kafka | ✓ Full |
| Micrometer / Actuator | ✓ Full |
| Testcontainers | ✓ Full |
| Liquibase / Flyway | ✓ Full |
| MapStruct | ✓ Full (AOT-based) |
| Lombok | ✓ Full (compile-time only) |
| Feign (OpenFeign) | ✓ With hints |
| Libraries using runtime bytecode generation (some CGLIB uses) | ⚠ May need custom hints |

Check the [GraalVM Reachability Metadata repository](https://github.com/oracle/graalvm-reachability-metadata) for hint files contributed by the community for third-party libraries.

## JVM vs native — the decision guide

```
Does your service scale to zero (serverless, spot instances, CLI)?
  Yes → Native image is a strong fit

Does your service cold-start under traffic (Kubernetes HPA scale-up)?
  Yes → Native image likely worth it

Is your primary concern throughput under sustained load?
  Yes → Stay on JVM (JIT wins on throughput)

Does your service run heavy background processing or batch jobs?
  Yes → Stay on JVM (long-running workloads favour JIT)

Is your team comfortable with 10+ minute CI builds and GDB-style debugging?
  No → Not yet — wait until native tooling matures further

Does your application heavily use libraries with dynamic class generation?
  Yes → Prototype first; compatibility may require significant hint work
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Start with a new, small service rather than migrating an existing large application. Native image compatibility is easier to maintain from the start than retrofitting years of reflection-heavy code. Once you have the pattern working on a small service, expand from there.</p>
</blockquote>

## Old way vs new way

| Area | Pre-Spring Boot 3 native | Spring Boot 4 + GraalVM 25 |
|---|---|---|
| AOT configuration | Manual hint files, fragile | Auto-generated by Spring AOT engine |
| Profile support | Minimal | Full runtime profile switching |
| Reflection hints | JSON files hand-written | `@RegisterReflectionForBinding`, `RuntimeHintsRegistrar` |
| Library compatibility | Hit-or-miss | Community metadata repository + Boot BOM |
| Build tooling | External native-image calls | `./mvnw -Pnative native:compile` |
| Testing | JVM tests only | `@NativeTest` for real native image tests |
| GraalVM version | Multiple incompatible versions | GraalVM 25 required, well-defined |

## Migration checklist for adding native image to a Spring Boot 4 service

**Setup:**
- [ ] Confirm GraalVM 25 is available locally or in CI (or use Docker buildpacks)
- [ ] Add `native-maven-plugin` to `pom.xml`
- [ ] Allocate 8+ GB RAM to native build step in CI
- [ ] Add `-Pnative native:compile` as a separate CI job (not on every commit)

**Validation:**
- [ ] Run `./mvnw -Pnative native:compile` and fix any build errors
- [ ] Add `@NativeTest` smoke tests for critical endpoints
- [ ] Verify all `@Profile`-conditional beans behave correctly
- [ ] Test JSON serialisation / deserialisation for every DTO type

**Common fix-ups:**
- [ ] Replace `@JsonComponent` with `@JacksonComponent` (already required for Spring Boot 4)
- [ ] Add `@RegisterReflectionForBinding` for any DTO not wired through Spring beans
- [ ] Register custom `RuntimeHintsRegistrar` for libraries not yet in the reachability metadata repo
- [ ] Add resource patterns for any files loaded via `ClassLoader.getResourceAsStream()`

**Production readiness:**
- [ ] Benchmark startup time and memory in a staging environment
- [ ] Confirm Actuator health and metrics endpoints respond
- [ ] Set up GDB or native image debugging symbols for production diagnostics
- [ ] Decide whether to ship JVM and native variants side by side during rollout

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Native image is not a drop-in optimisation — it changes your build pipeline, debugging tools, and places real constraints on how your application is structured. For services that stay running for hours, the JVM's JIT compiler will generally outperform a native binary at peak throughput. Native image wins when <em>startup time and idle memory</em> are what matter most.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-boot/reference/packaging/native-image/introducing-graalvm-native-images.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot — Introducing GraalVM Native Images</a>
- <a href="https://www.graalvm.org/latest/reference-manual/native-image/guides/build-spring-boot-app-into-native-executable/" target="_blank" rel="noopener" referrerpolicy="origin">GraalVM — Build a Spring Boot app into a native executable</a>
- <a href="https://github.com/oracle/graalvm-reachability-metadata" target="_blank" rel="noopener" referrerpolicy="origin">GraalVM Reachability Metadata repository</a>
- <a href="https://www.javacodegeeks.com/2025/08/graalvm-and-spring-boot-best-practices-for-native-image-spring-apps.html" target="_blank" rel="noopener" referrerpolicy="origin">GraalVM and Spring Boot — best practices (Java Code Geeks)</a>
- <a href="https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-with-GraalVM" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot with GraalVM — official wiki</a>
