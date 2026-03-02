---
title: Persistent chat memory in Spring AI — survive restarts and scale horizontally
description: InMemoryChatMemory loses all conversations on restart and doesn't work across multiple application instances. JdbcChatMemory stores conversation history in PostgreSQL — persistent, durable, and load-balancer friendly.
pubDatetime: "2026-03-03T14:00:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev deployed the support assistant with `InMemoryChatMemory`. It worked well in testing. Then the first production deployment happened. The application restarted during a routine update and every active conversation was wiped. Users had to repeat themselves from the beginning.

Two weeks later, a second instance was added for load balancing. Users whose requests bounced between instances lost their conversation context mid-session.

Both problems have the same fix: replace in-memory storage with database storage.

## Table of contents

## Why JdbcChatMemory

`JdbcChatMemory` stores conversation messages in a relational database table using standard JDBC. Conversations survive application restarts, and every application instance reads from and writes to the same database — so load balancing works transparently.

For the TechGadgets support assistant, which already uses PostgreSQL for pgvector, adding chat memory to the same database requires no new infrastructure.

## Step 1 — Add the dependency

`JdbcChatMemory` ships in a dedicated starter:

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-jdbc-store-spring-boot-starter</artifactId>
</dependency>
```

Spring Boot's JDBC auto-configuration (`spring-boot-starter-jdbc`) must be on the classpath — it typically already is via Spring Data JPA or the PostgreSQL starter.

## Step 2 — Create the schema

Spring AI can initialise the schema automatically, or you can manage it yourself via Flyway:

**Option A — auto-init (development):**

```yaml
spring:
  ai:
    chat:
      memory:
        repository:
          jdbc:
            initialize-schema: always   # creates the table on startup
```

**Option B — Flyway migration (production, recommended):**

Create `src/main/resources/db/migration/V2__chat_memory.sql`:

```sql
CREATE TABLE IF NOT EXISTS spring_ai_chat_memory (
    conversation_id VARCHAR(36)  NOT NULL,
    content         TEXT         NOT NULL,
    type            VARCHAR(10)  NOT NULL,  -- USER | ASSISTANT | SYSTEM | TOOL
    timestamp       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_memory_conversation_id
    ON spring_ai_chat_memory (conversation_id);

CREATE INDEX IF NOT EXISTS idx_chat_memory_timestamp
    ON spring_ai_chat_memory (conversation_id, timestamp);
```

The second index speeds up the common access pattern: retrieve all messages for a conversation ordered by timestamp.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Manage the chat memory schema through Flyway like any other database table. This gives you version-controlled schema changes, consistent state across environments, and the ability to add columns (like a TTL field) later without losing existing data.</p>
</blockquote>

## Step 3 — Replace InMemoryChatMemory with JdbcChatMemory

The swap is a single bean change:

```java
@Configuration
class AiConfig {

    // Before: in-memory (loses data on restart)
    // @Bean
    // ChatMemory chatMemory() {
    //     return new InMemoryChatMemory();
    // }

    // After: JDBC-backed (persistent)
    @Bean
    ChatMemory chatMemory(JdbcChatMemoryRepository repository) {
        return JdbcChatMemory.create(repository);
    }

    @Bean
    ChatClient supportClient(
            ChatClient.Builder builder,
            VectorStore vectorStore,
            ChatMemory chatMemory
    ) {
        return builder
                .defaultSystem(new ClassPathResource("prompts/support-system.st"))
                .defaultAdvisors(
                    new QuestionAnswerAdvisor(
                        vectorStore,
                        SearchRequest.defaults().withTopK(5).withSimilarityThreshold(0.7)
                    ),
                    MessageChatMemoryAdvisor.builder(chatMemory)
                        .conversationWindowSize(20)
                        .build()
                )
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.2)
                        .maxTokens(500)
                        .build())
                .build();
    }
}
```

`JdbcChatMemoryRepository` is auto-configured by the starter. It uses the existing `DataSource` bean.

The controller code is unchanged — the conversation ID parameter, the `CONVERSATION_ID_KEY` constant, everything stays the same. The persistence is entirely behind the `ChatMemory` interface.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> <code>JdbcChatMemory</code> uses the same <code>DataSource</code> as the rest of your application. Every message read/write is a database query. In high-throughput applications, this adds DB load. Monitor the <code>spring_ai_chat_memory</code> table size and query performance — add connection pool tuning if needed.</p>
</blockquote>

## Verifying persistence across restarts

A simple test: start the application, have a conversation, restart, continue the conversation and verify the assistant remembers.

```bash
# Start the application
./mvnw spring-boot:run

# Turn 1
curl -X POST http://localhost:8080/api/support/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "I ordered ProX headphones, order TG-9821.", "conversationId": "test-session"}'

# Restart the application (Ctrl+C, then run again)
./mvnw spring-boot:run

# Turn 2 — the assistant should still know about the order
curl -X POST http://localhost:8080/api/support/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What was my order number?", "conversationId": "test-session"}'
```

After the restart, the response should reference "TG-9821" — retrieved from the database.

## Managing conversation history at scale

With persistent storage, conversations accumulate indefinitely. Add a cleanup job to remove old conversations:

```java
@Repository
interface ChatMemoryRepository extends JdbcChatMemoryRepository {

    @Modifying
    @Query("""
        DELETE FROM spring_ai_chat_memory
        WHERE conversation_id = :conversationId
        AND timestamp < :cutoff
        """)
    void deleteOlderThan(
        @Param("conversationId") String conversationId,
        @Param("cutoff") OffsetDateTime cutoff
    );

    @Modifying
    @Query("""
        DELETE FROM spring_ai_chat_memory
        WHERE timestamp < :cutoff
        """)
    int deleteAllOlderThan(@Param("cutoff") OffsetDateTime cutoff);
}
```

```java
@Component
class ConversationCleanupJob {

    private final ChatMemoryRepository repository;

    ConversationCleanupJob(ChatMemoryRepository repository) {
        this.repository = repository;
    }

    @Scheduled(cron = "0 0 2 * * *")   // 2 AM daily
    @Transactional
    void cleanupOldConversations() {
        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(30);
        int deleted = repository.deleteAllOlderThan(cutoff);
        log.info("Cleaned up {} messages older than 30 days", deleted);
    }
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Align conversation retention with your privacy policy. If you state that user data is retained for 90 days, configure the cleanup job accordingly. Log the cleanup job's output so you have an audit trail of how much data was removed and when.</p>
</blockquote>

## Exposing conversation history to the user

Users sometimes want to see or export their conversation history. Add an endpoint to retrieve it:

```java
@GetMapping("/chat/{conversationId}/history")
List<MessageDto> getHistory(@PathVariable String conversationId) {
    List<Message> messages = chatMemory.get(conversationId, Integer.MAX_VALUE);
    return messages.stream()
            .filter(m -> m.getMessageType() == MessageType.USER
                      || m.getMessageType() == MessageType.ASSISTANT)
            .map(m -> new MessageDto(
                m.getMessageType().name().toLowerCase(),
                m.getText(),
                null   // timestamp not exposed by Message interface
            ))
            .toList();
}

record MessageDto(String role, String content, Instant timestamp) {}
```

## Using a separate DataSource for chat memory (optional)

For applications with very high conversation volume, isolate chat memory to a separate database to prevent it from competing with application queries:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://app-db:5432/supportapp
    username: appuser
    password: apppass

  ai:
    chat:
      memory:
        repository:
          jdbc:
            datasource:
              url: jdbc:postgresql://memory-db:5432/chatmemory
              username: memoryuser
              password: memorypass
```

Spring AI's JDBC memory starter supports a dedicated datasource configuration. This is an advanced setup for high-scale deployments — start with the shared datasource and only separate them when you have measured contention.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Conversation history stored in a database is personally identifiable information. Apply your standard data security practices: encrypt at rest, restrict access to the <code>spring_ai_chat_memory</code> table, include it in your data retention and deletion policies, and disclose it in your privacy notice.</p>
</blockquote>

## When to use each memory backend

| Situation | Use |
|---|---|
| Local development | `InMemoryChatMemory` — simple, no setup |
| Single-instance production | `JdbcChatMemory` — survives restarts |
| Multi-instance (load balanced) | `JdbcChatMemory` — shared state |
| High-throughput, many concurrent users | `JdbcChatMemory` with connection pooling |
| Very high scale, latency-sensitive | Redis-based memory (custom implementation) |

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post addresses a subtler problem: even with persistent memory, long conversations fill the context window. The windowed approach drops old messages completely. There is a smarter option — summarise older history and keep the summary instead of the raw messages. The final post in this module covers windowed memory and summarisation together.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_chat_memory" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ChatMemory reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/chat/memory/jdbc.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI JDBC Chat Memory reference</a>
