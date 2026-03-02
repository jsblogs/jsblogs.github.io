---
title: Fine-grained Jackson configuration in Spring Boot 4.1
description: Spring Boot 4.1 adds dedicated spring.jackson.read.* and spring.jackson.write.* properties so you can control serialization and deserialization separately without touching Java code. Here's what changed and how to use it.
pubDatetime: "2026-03-02T17:45:00+05:30"
tags:
  - springboot
  - spring
  - java
  - jackson
---

Jackson is the default JSON library in almost every Spring Boot application, but tuning it precisely has always required more effort than it should. Spring Boot 4.1 introduces separate `spring.jackson.read.*` and `spring.jackson.write.*` property namespaces so you can control deserialization and serialization independently — without writing a single line of Java configuration.

## Table of contents

## The problem with older versions (Spring Boot 3.x and earlier)

Spring Boot has long exposed some Jackson properties, but the coverage was uneven and the separation between reading and writing was blurry.

### Limited built-in properties

Spring Boot 3.x exposed a flat set of Jackson settings: date format, property naming strategy, visibility, and a handful of serialization features. For anything else, you were on your own.

```properties
# Spring Boot 3.x - fine for basics
spring.jackson.serialization.write-dates-as-timestamps=false
spring.jackson.deserialization.fail-on-unknown-properties=false
spring.jackson.default-property-inclusion=non_null
```

That worked for common cases, but there was no systematic way to configure the full range of `SerializationFeature` and `DeserializationFeature` flags.

### Java-based ObjectMapper customization scattered config

When teams needed more control, the usual answer was a `@Bean` to customize `ObjectMapper`:

```java
@Configuration
class JacksonConfig {

    @Bean
    Jackson2ObjectMapperBuilderCustomizer customizer() {
        return builder -> builder
                .featuresToEnable(SerializationFeature.INDENT_OUTPUT)
                .featuresToDisable(DeserializationFeature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE)
                .featuresToEnable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS);
    }
}
```

This worked, but it split Jackson configuration between `application.properties` and Java code, making it harder to audit behavior in one place.

### Read and write settings were conflated

There was no clean way to say "only when deserializing" vs "only when serializing." Many settings were global, and toggling them for one direction often had unintended effects on the other.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> When Jackson configuration is split across properties files and multiple Java beans, tracking down unexpected serialization behavior during debugging takes much longer than it should.</p>
</blockquote>

## What Spring Boot 4.1 changes

Spring Boot 4.1 introduces two new property namespaces that map directly to Jackson's `DeserializationFeature` and `SerializationFeature` enums.

- `spring.jackson.read.*` — controls deserialization (reading JSON into Java objects)
- `spring.jackson.write.*` — controls serialization (writing Java objects to JSON)

### Configure deserialization precisely

Control how Jackson reads JSON without touching Java code.

```properties
# Fail if an unknown field arrives — catch schema drift early
spring.jackson.read.fail-on-unknown-properties=true

# Be lenient with single-value arrays
spring.jackson.read.accept-single-value-as-array=true

# Do not adjust dates to the local timezone on read
spring.jackson.read.adjust-dates-to-context-time-zone=false
```

### Configure serialization precisely

Control how Jackson writes JSON, separately from reading behavior.

```properties
# Pretty-print JSON in development environments
spring.jackson.write.indent-output=true

# Do not serialize dates as numeric timestamps
spring.jackson.write.write-dates-as-timestamps=false

# Omit null values from output
spring.jackson.write.write-null-map-values=false
```

### Combine both in one place

Both namespaces live side by side in `application.properties` or `application.yaml`. No Java required for most use cases.

```yaml
spring:
  jackson:
    default-property-inclusion: non_null
    read:
      fail-on-unknown-properties: true
      accept-single-value-as-array: true
    write:
      indent-output: false
      write-dates-as-timestamps: false
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use environment-specific property files to vary Jackson settings. For example, enable <code>write.indent-output=true</code> in <code>application-dev.properties</code> for readable payloads during local development, and keep it off in production.</p>
</blockquote>

## Old way vs new way

| Area | Older versions | Spring Boot 4.1 |
|---|---|---|
| Deserialization control | Limited properties + Java config | `spring.jackson.read.*` namespace |
| Serialization control | Limited properties + Java config | `spring.jackson.write.*` namespace |
| Config location | Split between properties and beans | All in properties/yaml |
| Clarity on read vs write | Mixed together | Separate namespaces |

## Practical tips for rollout

1. Audit your existing `Jackson2ObjectMapperBuilderCustomizer` beans and move every flag that has a matching property to `application.properties`.
2. Use `spring.jackson.read.fail-on-unknown-properties=true` in staging to catch schema drift early.
3. Set per-environment `write.indent-output` rather than toggling it in code.
4. Check the full list of supported flags in the Spring Boot 4.1 reference documentation — the coverage is significantly wider than 3.x.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> If you set a feature in both <code>application.properties</code> and a Java customizer bean, the bean takes precedence. After migrating, remove the Java config entry to avoid confusion about which value is active.</p>
</blockquote>

## Migration checklist from older projects

1. Open each `Jackson2ObjectMapperBuilderCustomizer` or `ObjectMapper` bean in the project.
2. List every `featuresToEnable()` and `featuresToDisable()` call.
3. For each flag, check whether a matching `spring.jackson.read.*` or `spring.jackson.write.*` property exists in Spring Boot 4.1 docs.
4. Move those flags to `application.properties` and delete the corresponding Java line.
5. If the Java bean becomes empty after migrating all flags, delete the bean class entirely.
6. Run a serialization round-trip test to confirm JSON output is unchanged.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Centralizing Jackson config in properties makes behavior auditable, but it does not replace deliberate API design. Clear field names, consistent date formats, and stable schema are still the most important part of a good JSON contract.</p>
</blockquote>

## References

- <a href="https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.1-Release-Notes" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot 4.1 release notes</a>
- <a href="https://docs.spring.io/spring-boot/reference/features/json.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot JSON configuration reference</a>
- <a href="https://fasterxml.github.io/jackson-databind/javadoc/2.19/com/fasterxml/jackson/databind/DeserializationFeature.html" target="_blank" rel="noopener" referrerpolicy="origin">Jackson DeserializationFeature javadoc</a>
- <a href="https://fasterxml.github.io/jackson-databind/javadoc/2.19/com/fasterxml/jackson/databind/SerializationFeature.html" target="_blank" rel="noopener" referrerpolicy="origin">Jackson SerializationFeature javadoc</a>
