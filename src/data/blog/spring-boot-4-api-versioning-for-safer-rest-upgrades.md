---
title: API versioning in Spring Boot 4.x for safer REST upgrades
description: Spring Boot 4.x adds first-class API versioning support for Spring MVC and WebFlux. Learn the old pain points, what changed, and how this feature helps teams ship API changes with less risk.
pubDatetime: "2026-03-02T03:54:00-05:00"
tags:
  - springboot
  - spring
  - rest-api
  - java
---

API changes are easy to introduce and hard to roll out safely. In Spring Boot 3.x and earlier, many teams handled versioning with custom filters, interceptors, or duplicated controller paths. That approach worked, but it often became inconsistent across services. Spring Boot 4.x adds built-in API versioning support, so you can standardize this with less custom code.

## Table of contents

## The problem with older versions (Spring Boot 3.x and earlier)

Before Spring Boot 4.x, versioning strategy was mostly team-defined. Some services used `/v1/...` and `/v2/...`, others used headers, and some mixed both. This made APIs harder to understand and harder to maintain.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> If each service versions APIs differently, client teams have to learn a new rule for every service.</p>
</blockquote>

### Version detection logic was repeated

Teams often wrote their own logic to read versions from headers, query parameters, or media types. The same parsing and validation code got copied between services. Small differences in implementation caused unexpected behavior in production.

### Controller mappings became noisy

A common pattern was duplicating request mappings for each version. That made controllers longer and harder to read. Over time, refactoring became risky because version-specific behavior was spread across many classes.

### Deprecation handling was easy to forget

Older versions usually needed deprecation and sunset communication, but many teams handled this manually. Without a standard approach, clients got inconsistent guidance about when to migrate. This increased support load and slowed down deprecation plans.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Changing response fields without introducing a new API version can break frontend and mobile apps without obvious errors.</p>
</blockquote>

## What Spring Boot 4.x changes

Spring Boot 4.x auto-configures the API versioning features introduced in Spring Framework 7. You can now declare a versioning strategy in configuration and bind endpoint versions directly in mapping annotations.

### Configure API version resolution

Use application properties to define how the version is read. For example, this configuration uses a request header.

```properties
spring.mvc.apiversion.use.header=API-Version
spring.mvc.apiversion.default=1.0
```

For WebFlux applications, use the corresponding `spring.webflux.apiversion.*` properties.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Start with a single version source (header or path). Avoid mixing strategies unless you have a strong reason.</p>
</blockquote>

### Bind versions directly in request mappings

You can declare versions on mapping annotations instead of building custom routing logic.

```java
@RestController
@RequestMapping("/accounts")
class AccountController {

    @GetMapping(path = "/{id}", version = "1.0+")
    AccountV1 getAccountV1(@PathVariable long id) {
        return new AccountV1(id, "legacy-name");
    }

    @GetMapping(path = "/{id}", version = "2.0")
    AccountV2 getAccountV2(@PathVariable long id) {
        return new AccountV2(id, "full-name", "premium");
    }
}

record AccountV1(long id, String name) {}
record AccountV2(long id, String name, String tier) {}
```

### Keep client requests consistent

Spring Framework 7 also adds support for setting API version metadata from clients in a consistent way.

```java
RestClient client = RestClient.builder()
        .baseUrl("http://localhost:8080")
        .apiVersionInserter(ApiVersionInserter.useHeader("API-Version"))
        .build();

AccountV2 account = client.get()
        .uri("/accounts/{id}", 42)
        .apiVersion(2.0)
        .retrieve()
        .body(AccountV2.class);
```

## Old way vs new way

| Area | Older versions | Spring Boot 4.x |
|---|---|---|
| Version routing | Custom filters/interceptors | Built-in version-aware mappings |
| Controller readability | Often duplicated paths | Version is declared on mapping |
| Client calls | Manual header/query handling | Standard client version inserter support |
| Team consistency | Service-by-service custom logic | Shared framework pattern |

## Practical tips for rollout

1. Keep `v1` stable while building `v2`.
2. Add integration tests for each supported version.
3. Return clear deprecation headers/messages for old versions.
4. Decide a sunset date early and communicate it to consumers.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Versioning solves compatibility problems, but it also adds maintenance cost. Keep only active versions and retire old ones on schedule.</p>
</blockquote>

## Migration checklist from older projects

1. Pick one version source first, usually a request header or path segment.
2. Configure `spring.mvc.apiversion.*` (or `spring.webflux.apiversion.*`) in one place.
3. Move version conditions from custom interceptors/filters into mapping annotations.
4. Keep unchanged behavior on a baseline mapping such as `"1.0+"`, then add strict mappings for new versions.
5. Add integration tests that verify routing for each supported version.

## References

- <a href="https://spring.io/blog/2025/11/20/spring-boot-4-0-0-available-now/" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot 4.0 release announcement</a>
- <a href="https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Release-Notes" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot 4.0 release notes</a>
- <a href="https://docs.spring.io/spring-framework/reference/7.0/web/webmvc-versioning.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring Framework 7 API versioning reference</a>
