---
title: JmsClient in Spring Boot 4.x for cleaner messaging code
description: Spring Boot 4.x adds auto-configuration for JmsClient, a modern alternative to JmsTemplate with a fluent API. Learn what made the old approach painful, what changed, and how to migrate.
pubDatetime: "2026-03-02T17:25:00+05:30"
tags:
  - springboot
  - spring
  - java
---

If you have worked with JMS in Spring, you know `JmsTemplate`. It got the job done, but sending a message — even a simple one — required callbacks, session handling, and boilerplate that felt out of place next to modern Spring code. Spring Boot 4.x addresses this by adding auto-configuration for `JmsClient`, a cleaner alternative with a fluent, builder-style API.

## Table of contents

## The problem with older versions (Spring Boot 3.x and earlier)

`JmsTemplate` has been in Spring for a long time. It made JMS accessible without managing connections directly, but working with it had friction that accumulated over time.

### Sending a message meant callbacks inside callbacks

To send a message with custom properties or headers, you had to use a `MessageCreator` lambda that took a `Session` and returned a `Message`. This forced messaging logic into a nested structure.

```java
jmsTemplate.send("orders", session -> {
    TextMessage message = session.createTextMessage(orderJson);
    message.setStringProperty("eventType", "ORDER_PLACED");
    message.setIntProperty("priority", 5);
    return message;
});
```

For a simple send with a couple of headers, that is a lot of plumbing.

### No fluent way to configure per-message options

`JmsTemplate` was not designed for a fluent API. Options like delivery mode, time-to-live, and message priority required either setter configuration on the template itself (affecting all sends) or separate `MessagePostProcessor` arguments — neither of which was readable.

### Reading selectively was awkward

Receiving a message matching a selector required going through `receiveSelected()` with a raw JMS selector string and no type-safe wrapper around the result.

```java
Message message = jmsTemplate.receiveSelected("orders", "eventType = 'ORDER_PLACED'");
if (message instanceof TextMessage textMessage) {
    String body = textMessage.getText();
    // process body
}
```

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Using `JmsTemplate` for multiple different message types in the same service often leads to duplicated callback logic. This makes changes risky and review harder.</p>
</blockquote>

## What Spring Boot 4.x changes

Spring Boot 4.x includes auto-configuration for `JmsClient` — a newer API from Spring Framework that brings a fluent, readable style to JMS operations. Think of it as `RestClient` for messaging.

### Send a message without callbacks

The fluent API replaces the `MessageCreator` callback with a clear chain of method calls.

```java
@Service
class OrderEventPublisher {

    private final JmsClient jmsClient;

    OrderEventPublisher(JmsClient jmsClient) {
        this.jmsClient = jmsClient;
    }

    void publish(String orderJson) {
        jmsClient.send()
                .destination("orders")
                .message(message -> message
                        .body(orderJson)
                        .property("eventType", "ORDER_PLACED")
                        .priority(5))
                .send();
    }
}
```

No session, no factory calls, no inner lambda that creates and returns a message type.

### Receive with a selector and typed result

Reading messages is just as clean. You can apply a selector and convert the body in one chain.

```java
Optional<String> nextOrder = jmsClient.receive()
        .destination("orders")
        .selector("eventType = 'ORDER_PLACED'")
        .message()
        .map(message -> {
            try {
                return ((TextMessage) message).getText();
            } catch (JMSException e) {
                throw new RuntimeException(e);
            }
        });
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use <code>JmsClient</code> for new messaging code and leave existing <code>JmsTemplate</code> usage in place until you have time to migrate. Both beans can live in the same application context.</p>
</blockquote>

### Auto-configuration out of the box

Spring Boot 4.x auto-configures `JmsClient` if a `ConnectionFactory` bean is present — the same condition that triggers `JmsTemplate` auto-configuration. No extra setup is needed.

```yaml
spring:
  activemq:
    broker-url: tcp://localhost:61616
    user: admin
    password: admin
```

That is all it takes. Boot configures the `ConnectionFactory`, and `JmsClient` is ready to inject.

## Old way vs new way

| Area | Older versions | Spring Boot 4.x |
|---|---|---|
| Send style | `MessageCreator` callback | Fluent builder chain |
| Per-message options | Setters on template or post-processors | Inline on the send chain |
| Receiving messages | `receiveSelected()` with raw strings | Fluent `receive().selector().message()` |
| Auto-configuration | `JmsTemplate` only | Both `JmsTemplate` and `JmsClient` |

## Practical tips for rollout

1. Introduce `JmsClient` in new message producers first before touching existing ones.
2. Use the fluent chain for any send that sets more than one property — it pays for itself immediately.
3. If you use `@JmsListener`, keep it as-is. `JmsClient` complements it, not replaces it.
4. Add a simple integration test with an embedded broker to confirm messages reach the destination.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Do not use <code>JmsClient</code> for message listener configuration. Listeners should still be declared with <code>@JmsListener</code> and container factories. <code>JmsClient</code> is for sending and receiving on demand.</p>
</blockquote>

## Migration checklist from older projects

1. Check all `JmsTemplate.send()` calls that use `MessageCreator` callbacks.
2. For each one, rewrite using `jmsClient.send().destination(...).message(...).send()`.
3. Replace `jmsTemplate.receiveSelected()` calls with `jmsClient.receive().selector(...).message()`.
4. Remove any `MessagePostProcessor` usage where it was only setting properties.
5. Run integration tests against an embedded broker to confirm message content and headers.
6. Leave `@JmsListener` methods untouched.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> <code>JmsClient</code> reduces boilerplate, but message schema design, dead-letter handling, and consumer group strategy still require deliberate thought. The client is just the entry point.</p>
</blockquote>

## References

- <a href="https://spring.io/blog/2025/11/20/spring-boot-4-0-0-available-now/" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot 4.0 release announcement</a>
- <a href="https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Release-Notes" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot 4.0 release notes</a>
- <a href="https://docs.spring.io/spring-framework/reference/7.0/integration/jms.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring Framework JMS reference documentation</a>
