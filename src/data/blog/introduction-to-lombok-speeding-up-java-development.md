---
title: Introduction to Lombok (Speeding-up Java development)
description: This blog post covers Project Lombok annotations — updated for Lombok 1.18.x with modern setup, new annotations like @With, @SuperBuilder, @Slf4j, and deprecation notes.
pubDatetime: "2016-09-14T00:00:00-04:00"
modDatetime: "2026-03-02T00:00:00-05:00"
tags:
  - java
  - lombok
ogImage: /images/java/java-32.png
---

Today I am going to talk about [Project Lombok](https://projectlombok.org/) — a Java library that eliminates boilerplate code so you can focus on what actually matters. This post has been updated for **Lombok 1.18.x** (latest: **1.18.42**).

## Table of contents

## 1. Introduction

A simple POJO consists of private fields, getters/setters, constructors, `toString()`, `equals()`, and `hashCode()`. That is a lot of repetitive code. Lombok generates all of it at compile time via annotation processing — your source file stays clean, the bytecode gets everything it needs.

## 2. Setup

### Maven

```xml
<dependencies>
    <dependency>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <version>1.18.42</version>
        <scope>provided</scope>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <configuration>
                <annotationProcessorPaths>
                    <path>
                        <groupId>org.projectlombok</groupId>
                        <artifactId>lombok</artifactId>
                        <version>1.18.42</version>
                    </path>
                </annotationProcessorPaths>
            </configuration>
        </plugin>
    </plugins>
</build>
```

> The `annotationProcessorPaths` block is mandatory for JDK 23+ and best practice for any version.

### Gradle

```groovy
dependencies {
    compileOnly 'org.projectlombok:lombok:1.18.42'
    annotationProcessor 'org.projectlombok:lombok:1.18.42'

    testCompileOnly 'org.projectlombok:lombok:1.18.42'
    testAnnotationProcessor 'org.projectlombok:lombok:1.18.42'
}
```

### IntelliJ IDEA

Since **IntelliJ 2020.3**, the Lombok plugin is bundled — no manual installation needed. The only step required is enabling annotation processing:

**File → Settings → Build, Execution, Deployment → Compiler → Annotation Processors → check "Enable annotation processing"**

That's it.

---

## 3. Annotations

### @Getter / @Setter

Generates getter and setter methods. By default the access level is `public`, but you can override it with `AccessLevel`: `PUBLIC`, `PROTECTED`, `PACKAGE`, `PRIVATE`, `NONE`.

```java
@Getter
@Setter
public class User {
    private String name;
    private int age;

    @Setter(AccessLevel.PRIVATE)  // private setter for this field only
    private String id;
}
```

Using `AccessLevel.NONE` on a field suppresses generation for that field even when the annotation is placed at class level.

On the class:

```java
@Getter
@Setter
public class User {
    private String name;
    private int age;
}

// equivalent to:
public class User {
    private String name;
    private int age;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
}
```

> `@Setter` is not generated for `final` fields.

---

### @ToString and @EqualsAndHashCode

`@ToString` generates a `toString()` that includes the class name and all non-static fields by default.

`@EqualsAndHashCode` generates `equals()` and `hashCode()` based on non-static, non-transient fields by default.

**Modern approach — use field-level includes/excludes** (the class-level `of`/`exclude` parameters are deprecated since 1.16.22):

```java
@ToString
@EqualsAndHashCode
public class User {
    private Long id;
    private String email;

    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private String password;   // excluded from both
}
```

For opt-in (only include fields you explicitly mark):

```java
@ToString(onlyExplicitlyIncluded = true)
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class User {
    @ToString.Include
    @EqualsAndHashCode.Include
    private Long id;

    @ToString.Include
    private String email;

    private String password;   // not included
}
```

`@EqualsAndHashCode` also has a `callSuper` flag — set it to `true` when your class extends another class and you want the parent's implementation to be called.

---

### @NonNull

Generates a null check for constructor args, method parameters, or fields. Throws `NullPointerException` if null is passed.

```java
public class Person {
    @NonNull private String name;

    public Person(@NonNull String name) {
        this.name = name;
    }
}

// equivalent to:
public class Person {
    private String name;

    public Person(String name) {
        if (name == null) throw new NullPointerException("name is marked @NonNull but is null");
        this.name = name;
    }
}
```

---

### @NoArgsConstructor, @RequiredArgsConstructor, @AllArgsConstructor

**`@NoArgsConstructor`** generates a no-argument constructor. If the class has `final` fields use `@NoArgsConstructor(force = true)` to initialise them to `0` / `false` / `null`.

```java
@NoArgsConstructor(force = true)
public class Config {
    private final String host;   // initialised to null
    private final int port;      // initialised to 0
}
```

**`@RequiredArgsConstructor`** generates a constructor for all `final` fields and fields annotated with `@NonNull`.

```java
@RequiredArgsConstructor
public class Service {
    private final UserRepository userRepository;
    @NonNull private final String name;
}

// equivalent to:
public Service(UserRepository userRepository, String name) {
    if (name == null) throw new NullPointerException(...);
    this.userRepository = userRepository;
    this.name = name;
}
```

**`@AllArgsConstructor`** generates a constructor with all fields as parameters.

**Static factory method** — any constructor annotation accepts `staticName` to generate a private constructor and a public static factory:

```java
@AllArgsConstructor(staticName = "of")
public class Point {
    private final int x;
    private final int y;
}

// usage:
Point p = Point.of(1, 2);
```

---

### @Data

`@Data` is a shortcut combining:
- `@Getter` on all fields
- `@Setter` on all non-final fields
- `@RequiredArgsConstructor`
- `@ToString`
- `@EqualsAndHashCode`

```java
@Data
public class User {
    private final Long id;
    private String name;
    private String email;
}
```

> Avoid `@Data` on JPA entities — the generated `equals`/`hashCode` based on all fields can cause issues with Hibernate proxies and lazy loading.

---

### @Value

Creates an **immutable** class. All fields are made `private final`, no setters are generated, and the class itself is made `final`. Equivalent to `@Data` + all fields final + class final.

```java
@Value
public class Money {
    String currency;
    BigDecimal amount;
}

// equivalent to:
public final class Money {
    private final String currency;
    private final BigDecimal amount;

    public Money(String currency, BigDecimal amount) { ... }
    public String getCurrency() { ... }
    public BigDecimal getAmount() { ... }
    // equals, hashCode, toString
}
```

Use `@NonFinal` on a field to opt it out of the finality.

---

### @Builder

Generates a builder API. Creates an inner `<ClassName>Builder` class with fluent setters and a `build()` method.

```java
@Builder
public class Request {
    private String url;
    private String method;
    private int timeoutSeconds;
}

// usage:
Request req = Request.builder()
    .url("https://api.example.com")
    .method("GET")
    .timeoutSeconds(30)
    .build();
```

**`@Builder.Default`** — sets a default value when the caller doesn't supply one:

```java
@Builder
public class Request {
    private String method;

    @Builder.Default
    private int timeoutSeconds = 30;

    @Builder.Default
    private List<String> headers = new ArrayList<>();
}
```

**`toBuilder()`** — create a copy-and-modify pattern:

```java
@Builder(toBuilder = true)
public class Request { ... }

Request updated = original.toBuilder().method("POST").build();
```

**`@Singular`** — for collection fields, generates individual `add` methods alongside the collection setter:

```java
@Builder
public class Email {
    @Singular
    private List<String> recipients;
}

// usage:
Email.builder()
    .recipient("alice@example.com")
    .recipient("bob@example.com")
    .build();
```

---

### @SuperBuilder

`@Builder` does not work correctly across inheritance. `@SuperBuilder` does — annotate every class in the hierarchy with it.

```java
@SuperBuilder
public class Animal {
    private String name;
    private int age;
}

@SuperBuilder
public class Dog extends Animal {
    private String breed;
}

// usage:
Dog dog = Dog.builder()
    .name("Rex")
    .age(3)
    .breed("Labrador")
    .build();
```

> `@SuperBuilder` and `@Builder` cannot be mixed in the same hierarchy.

---

### @With

Generates a `withFieldName(value)` method that returns a new instance with only that field changed — useful for immutable objects.

```java
@Value
@With
public class Point {
    int x;
    int y;
}

Point p1 = new Point(1, 2);
Point p2 = p1.withX(10);   // new Point(10, 2) — p1 unchanged
```

`@With` can be placed on individual fields too:

```java
@Value
public class User {
    Long id;
    @With String email;   // only email gets a wither
}
```

> Requires an all-args constructor. `@Value` provides one automatically.

---

### @Slf4j / Logging annotations

Injects a `private static final` logger field named `log`. No more copy-pasting the logger declaration.

```java
@Slf4j
public class UserService {
    public void createUser(String name) {
        log.info("Creating user: {}", name);
        // ... logic ...
        log.debug("User created successfully");
    }
}

// equivalent to:
private static final org.slf4j.Logger log =
    org.slf4j.LoggerFactory.getLogger(UserService.class);
```

Available variants:

| Annotation | Logger type |
|---|---|
| `@Slf4j` | `org.slf4j.Logger` (recommended) |
| `@Log4j2` | `org.apache.logging.log4j.Logger` |
| `@CommonsLog` | `org.apache.commons.logging.Log` |
| `@Log` | `java.util.logging.Logger` |
| `@JBossLog` | `org.jboss.logging.Logger` |

---

### @SneakyThrows

Lets you throw a checked exception without declaring it in the method signature. The exception is not wrapped or swallowed — it propagates as-is at the bytecode level.

```java
@SneakyThrows(IOException.class)
public String readFile(Path path) {
    return Files.readString(path);
}
```

Use sparingly — best for exceptions that are impossible in practice (like `UnsupportedEncodingException` for UTF-8) or when implementing an interface that doesn't allow checked exceptions (like `Runnable`).

---

### @Cleanup

Automatically calls a resource's `close()` method (or another method you specify) at the end of the scope.

```java
public void copyFile(String src, String dest) throws IOException {
    @Cleanup InputStream in = new FileInputStream(src);
    @Cleanup OutputStream out = new FileOutputStream(dest);
    // copy bytes...
}
// in.close() and out.close() called automatically in reverse order
```

> In modern Java (7+), prefer **try-with-resources** (`try (var in = ...)`) which is a language feature and equally concise.

---

### @FieldDefaults _(experimental)_

Sets a default access level and/or finality for all instance fields, avoiding repetitive `private final` declarations.

```java
@Data
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class Person {
    String name;      // becomes: private final String name
    int age;          // becomes: private final int age

    @NonFinal
    String nickname;  // opt-out of final
}
```

---

### @Accessors _(experimental)_

Changes how getters and setters are named and behave.

```java
@Getter
@Setter
@Accessors(fluent = true, chain = true)
public class Builder {
    private String host;
    private int port;
}

// Usage:
new Builder()
    .host("localhost")   // no get/set prefix
    .port(8080)          // returns this for chaining
```

> `fluent = true` is incompatible with frameworks expecting standard JavaBean naming (Spring `@ConfigurationProperties`, Jackson without extra config).

---

## 4. Java Records vs Lombok

Java 16+ records are the language-native solution for simple immutable data:

```java
// Modern Java record — no Lombok needed
public record Point(int x, int y) {}
```

Lombok still shines for:
- Classes needing **mutability** (`@Data`, `@Setter`)
- **Builder pattern** on complex objects (`@Builder`, `@SuperBuilder`)
- **Inheritance hierarchies** (`@SuperBuilder`)
- **Logging** (`@Slf4j`)

You can use both in the same project. Avoid applying `@Data`, `@Value`, `@Getter`, or `@Setter` to records — records already generate those.

---

Happy Coding! If you have any feedback, drop a comment below.
