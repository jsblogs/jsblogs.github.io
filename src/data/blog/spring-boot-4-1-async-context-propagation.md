---
title: Async context propagation improvements in Spring Boot 4.1
description: Spring Boot 4.1 improves how Micrometer observation context, security context, and MDC values carry over to async threads. Learn why context used to get lost, what changed, and how to configure it.
pubDatetime: "2026-03-02T18:05:00+05:30"
tags:
  - springboot
  - spring
  - java
---

You trace a request through your system. It starts fine — the trace ID shows up in logs, the user identity is visible, the span is open. Then your code calls an `@Async` method, and everything goes quiet. No trace ID in the async logs, no security context, no span. The context vanished the moment the work moved to another thread.

This is one of those bugs that only surfaces under real conditions and takes too long to debug the first time. Spring Boot 4.1 improves async context propagation so your observability and security context follow the work, not just the thread.

## Table of contents

## The problem with older versions (Spring Boot 3.x and earlier)

When code moves to an async thread pool, it starts with a clean slate. That is by design in Java — thread locals are per-thread. But many Spring features rely on thread-local storage, and losing them in async flows caused real production pain.

### Trace IDs disappeared from async logs

Micrometer and Zipkin/OTLP tracing store the current span in a thread-local. When `@Async` moved execution to the pool, the new thread had no trace context. Log lines from async methods had no trace ID, making distributed traces incomplete and dashboards misleading.

```java
@Service
class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    @Async
    public void sendWelcomeEmail(String userId) {
        // This log line has no traceId in the MDC — context was lost on thread switch
        log.info("Sending welcome email to {}", userId);
    }
}
```

### SecurityContext was not available in async methods

Spring Security stores the authenticated principal in a `SecurityContextHolder` backed by a thread-local. Async methods that checked the current user received an empty context, causing `NullPointerException` or unexpected anonymous-user behavior.

### Manual workarounds were fragile

The common fix was a custom `TaskDecorator` that copied thread locals from the calling thread to the async thread before execution:

```java
@Bean
TaskExecutor asyncTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setTaskDecorator(runnable -> {
        SecurityContext context = SecurityContextHolder.getContext();
        return () -> {
            try {
                SecurityContextHolder.setContext(context);
                runnable.run();
            } finally {
                SecurityContextHolder.clearContext();
            }
        };
    });
    executor.initialize();
    return executor;
}
```

This worked for security, but you had to repeat similar logic for MDC values and tracing. Miss one, and a piece of context was still absent.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Incomplete trace context in async logs is worse than no tracing at all. You see partial traces that look like separate requests, making it impossible to follow a request end-to-end in production.</p>
</blockquote>

## What Spring Boot 4.1 changes

Spring Boot 4.1 leverages the context propagation support in Spring Framework 6.2 to carry Micrometer observation context, MDC values, and security context automatically into async thread pools — without custom `TaskDecorator` code.

### Observation context propagation is automatic

When a `ThreadPoolTaskExecutor` is configured as a Spring bean, Boot 4.1 automatically wraps it with context propagation support. The active Micrometer observation (trace ID, span ID) is restored on the async thread.

```java
@Service
class ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportService.class);

    @Async
    public void generateReport(String reportId) {
        // Boot 4.1: traceId and spanId are present in the MDC here
        log.info("Generating report {}", reportId);
        // ... report logic
    }
}
```

No extra configuration. The trace ID follows the work.

### MDC propagation for your own keys

Any values you add to the MDC on the calling thread are now forwarded to the async thread as well.

```java
@RestController
class OrderController {

    private final OrderService orderService;

    OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/orders")
    ResponseEntity<Void> placeOrder(@RequestBody OrderRequest request) {
        MDC.put("customerId", request.customerId());
        orderService.processAsync(request);  // customerId will be in MDC inside processAsync
        return ResponseEntity.accepted().build();
    }
}
```

### Configure security context propagation explicitly

For `SecurityContext` propagation, Spring Security's `DelegatingSecurityContextAsyncTaskExecutor` is still the recommended approach, but Boot 4.1 makes it easier to configure centrally.

```java
@Configuration
@EnableAsync
class AsyncConfig implements AsyncConfigurer {

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(10);
        executor.setThreadNamePrefix("async-");
        executor.initialize();
        // Wrap with security context propagation
        return new DelegatingSecurityContextAsyncTaskExecutor(executor);
    }
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Give your async executors a meaningful thread name prefix (e.g., <code>report-async-</code>, <code>email-async-</code>). When context propagation is working, those thread names appear in logs alongside the trace ID — making async flows easy to spot in log aggregators.</p>
</blockquote>

## Old way vs new way

| Area | Older versions | Spring Boot 4.1 |
|---|---|---|
| Trace context in async threads | Lost on thread switch | Propagated automatically |
| MDC in async threads | Requires custom `TaskDecorator` | Propagated automatically |
| Security context in async threads | Manual decorator or missing | Easy central config |
| Developer effort | Write propagation logic per context type | Configure once or zero config |

## Practical tips for rollout

1. Enable debug-level logging for a few async methods and verify trace IDs appear after upgrading to Boot 4.1.
2. Name your `ThreadPoolTaskExecutor` beans clearly — Boot applies context propagation to beans it detects in the context.
3. Use `DelegatingSecurityContextAsyncTaskExecutor` for any executor that runs code needing authentication.
4. Add a log statement at the top of each major `@Async` method so you can verify context presence during smoke tests.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Context propagation adds a small overhead — capturing context on the calling thread and restoring it on the async thread. For extremely high-frequency, low-latency async tasks, measure whether this overhead is acceptable in your workload before enabling it everywhere.</p>
</blockquote>

## Migration checklist from older projects

1. Identify `@Async` methods in the project where logs show missing `traceId` or `userId`.
2. Upgrade to Spring Boot 4.1 and rerun the same async flows.
3. Check logs — Micrometer trace context and MDC keys should now appear on async threads.
4. Find any custom `TaskDecorator` that manually copies MDC values. Remove the MDC-related lines (now handled automatically).
5. For security context: wrap executors with `DelegatingSecurityContextAsyncTaskExecutor`.
6. Delete any remaining decorator-only beans that are now empty after removing manual propagation code.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Automatic context propagation removes boilerplate but does not replace good async design. Long-running async tasks should still handle timeouts, use proper error channels, and avoid silently swallowing exceptions.</p>
</blockquote>

## References

- <a href="https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.1-Release-Notes" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot 4.1 release notes</a>
- <a href="https://docs.spring.io/spring-framework/reference/7.0/core/scheduling.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring Framework async task execution reference</a>
- <a href="https://micrometer.io/docs/contextPropagation" target="_blank" rel="noopener" referrerpolicy="origin">Micrometer context propagation documentation</a>
- <a href="https://docs.spring.io/spring-security/reference/features/integrations/concurrency.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring Security concurrent execution reference</a>
