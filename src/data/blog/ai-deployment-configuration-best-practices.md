---
title: Deployment and configuration best practices for AI-powered Spring Boot apps
description: "Shipping an AI feature involves more than the code: API key management, environment-specific model routing, database schema for vector storage, feature flags for safe rollouts, and a pre-deploy checklist. This post covers the production-readiness concerns specific to AI applications."
pubDatetime: "2026-03-03T18:00:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev's team had the support assistant passing all tests. The code review was done. The question was: is it actually ready to deploy?

Deploying an AI feature has a longer checklist than a standard REST endpoint. API keys in environment variables, model choice locked per environment, vector store schema managed by migrations, feature flags for gradual rollout, and monitoring dashboards in place before the first user hits production.

## Table of contents

## API key management

Never put API keys in code, properties files, or version control. Use environment variables or a secrets manager:

**Development (`.env` file, not committed):**
```bash
OPENAI_API_KEY=sk-dev-...
COHERE_API_KEY=...
```

**application.yml (safe to commit):**
```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}     # reads from environment
    cohere:
      api-key: ${COHERE_API_KEY}
```

**Production (AWS Parameter Store / Secrets Manager):**
```yaml
# application-prod.yml
spring:
  config:
    import: "aws-parameterstore:/techgadgets/prod/ai/"

spring:
  ai:
    openai:
      api-key: ${ai.openai.api-key}   # resolved from Parameter Store
```

With Spring Cloud AWS, secrets are loaded at startup and injected as Spring properties.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Rotate API keys regularly and immediately if a key is ever exposed. Add a Git pre-commit hook (<code>gitleaks</code> or <code>detect-secrets</code>) to prevent accidental key commits. LLM provider keys provide direct access to a billing account — treat them like database passwords.</p>
</blockquote>

## Environment-specific model routing

Use different models per environment to control cost and prevent production charges during development:

```yaml
# application.yml (base config — safe defaults)
spring:
  ai:
    openai:
      chat:
        options:
          model: gpt-4o-mini
      embedding:
        options:
          model: text-embedding-3-small
```

```yaml
# application-dev.yml (local development — use Ollama, no API costs)
spring:
  ai:
    ollama:
      base-url: http://localhost:11434
      chat:
        options:
          model: llama3.2:3b
      embedding:
        options:
          model: nomic-embed-text
    vectorstore:
      pgvector:
        dimensions: 768   # nomic-embed-text dimension

# Disable OpenAI in dev profile
spring:
  ai:
    openai:
      api-key: "disabled"
```

```yaml
# application-staging.yml (staging — real OpenAI but cheap model)
spring:
  ai:
    openai:
      chat:
        options:
          model: gpt-4o-mini
          max-tokens: 300

# application-prod.yml (production — tune per observed usage)
spring:
  ai:
    openai:
      chat:
        options:
          model: gpt-4o-mini
          max-tokens: 500
          temperature: 0.2
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Set <code>SPRING_PROFILES_ACTIVE=dev</code> in your local environment and always run Ollama locally. This means every developer can run the full application without an API key, and no development queries hit the OpenAI billing account.</p>
</blockquote>

## Vector store schema in Flyway migrations

Manage the pgvector schema like any other database schema — through versioned migrations:

**V1__init.sql:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**V2__vector_store.sql:**
```sql
CREATE TABLE IF NOT EXISTS vector_store (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT        NOT NULL,
    metadata    JSONB,
    embedding   vector(1536)
);

CREATE INDEX IF NOT EXISTS idx_vector_store_embedding
    ON vector_store USING HNSW (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_vector_store_source
    ON vector_store USING GIN ((metadata -> 'source'));
```

**V3__chat_memory.sql:**
```sql
CREATE TABLE IF NOT EXISTS spring_ai_chat_memory (
    conversation_id VARCHAR(36)  NOT NULL,
    content         TEXT         NOT NULL,
    type            VARCHAR(10)  NOT NULL,
    timestamp       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_memory_conversation
    ON spring_ai_chat_memory (conversation_id, timestamp);
```

Set `initialize-schema: false` in `application-prod.yml` — Flyway owns the schema:

```yaml
spring:
  ai:
    vectorstore:
      pgvector:
        initialize-schema: false   # Flyway manages schema in all non-dev environments
```

## Feature flags for gradual rollout

Never ship an AI feature to 100% of users on day one. Use a feature flag to control rollout:

```java
@RestController
@RequestMapping("/api/support")
class SupportController {

    private final ChatClient chatClient;
    private final FeatureFlagService featureFlags;
    private final LegacyRuleBasedService legacyService;

    SupportController(
            ChatClient chatClient,
            FeatureFlagService featureFlags,
            LegacyRuleBasedService legacyService
    ) {
        this.chatClient = chatClient;
        this.featureFlags = featureFlags;
        this.legacyService = legacyService;
    }

    @PostMapping("/chat")
    SupportResponse chat(@RequestBody SupportRequest request, Authentication auth) {
        if (featureFlags.isEnabled("ai-support-assistant", auth.getName())) {
            String answer = chatClient.prompt()
                    .user(request.question())
                    .advisors(a -> a.param(CONVERSATION_ID_KEY, request.conversationId()))
                    .call()
                    .content();
            return new SupportResponse(answer);
        }

        // Fall back to rule-based response for users not in AI rollout
        return legacyService.answer(request.question());
    }
}
```

Roll out the AI feature at 5%, then 20%, then 50%, then 100% — monitoring answer quality and error rate at each stage before proceeding.

## Health checks for AI dependencies

Add a health indicator so Kubernetes/ECS knows the application is ready to serve:

```java
@Component("openAiHealth")
class OpenAiHealthIndicator extends AbstractHealthIndicator {

    private final ChatClient chatClient;

    OpenAiHealthIndicator(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    @Override
    protected void doHealthCheck(Health.Builder builder) {
        try {
            // Cheap call to verify the model is reachable
            String response = chatClient.prompt()
                    .user("Reply with 'ok' and nothing else.")
                    .options(OpenAiChatOptions.builder()
                            .maxTokens(5)
                            .build())
                    .call()
                    .content();

            builder.up()
                   .withDetail("model", "gpt-4o-mini")
                   .withDetail("response", response.trim());
        } catch (Exception e) {
            builder.down()
                   .withDetail("error", e.getMessage());
        }
    }
}
```

```yaml
management:
  health:
    openAiHealth:
      enabled: true
```

This makes the `/actuator/health` endpoint reflect actual LLM availability. Kubernetes readiness probes should check `/actuator/health/readiness` — if OpenAI is down, mark the pod as not ready (or degrade gracefully using the feature flag fallback).

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> The health check above makes a real API call on every health probe. Kubernetes probes every 10 seconds by default. 6 API calls per minute × 5 cents per 1,000 calls = negligible cost — but add a 5-minute cache to the health check to avoid unnecessary calls if your probe interval is very aggressive.</p>
</blockquote>

## Knowledge base ingestion in CI/CD

For production, ingestion should be a controlled, auditable operation — not something that runs automatically on deployment:

```yaml
# .github/workflows/ingest-knowledge-base.yml
name: Ingest Knowledge Base
on:
  workflow_dispatch:   # manual trigger only
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: staging
        type: choice
        options: [staging, production]

jobs:
  ingest:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - name: Trigger ingestion
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
            ${{ vars.APP_URL }}/admin/knowledge-base/ingest
```

Manual trigger means a human explicitly decides when to re-ingest documents — preventing accidental re-ingestion that would duplicate chunks.

## Pre-deploy checklist

Before deploying to production:

**Configuration:**
- [ ] All API keys in environment variables or secrets manager (not in code)
- [ ] `initialize-schema: false` — Flyway manages all schemas
- [ ] Model name explicitly configured per environment
- [ ] `maxTokens` set appropriately for each `ChatClient`
- [ ] Rate limiting configured on AI endpoints
- [ ] Retry configuration set for transient errors

**Observability:**
- [ ] Micrometer metrics for token usage and latency exposed
- [ ] Distributed tracing enabled (Zipkin/Jaeger/Tempo)
- [ ] Grafana dashboards for token spend and latency
- [ ] Alerts configured for error rate and token budget
- [ ] `SimpleLoggerAdvisor` disabled or set to WARN in production

**Safety:**
- [ ] Input length limits implemented
- [ ] Injection pattern detection enabled
- [ ] Rate limiting per user/session configured
- [ ] Out-of-scope response validation advisor registered
- [ ] PII scrubbing in logging

**Testing:**
- [ ] Eval suite run against production configuration
- [ ] Integration tests pass with production model
- [ ] Fallback behaviour tested (LLM down, no context found)
- [ ] Feature flag configured for gradual rollout

**Operations:**
- [ ] Health check endpoint includes AI dependency status
- [ ] Knowledge base ingestion workflow requires manual approval
- [ ] Conversation history cleanup job scheduled
- [ ] On-call runbook written for "LLM is down" scenario

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Module 7 is complete. The support assistant is now production-ready: observable, cost-managed, tested, safe, resilient to errors, and deployed via a controlled rollout. Module 8 covers the advanced topics — local models, multimodal AI, and a comparison with LangChain4j — for when you are ready to go beyond the fundamentals.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-boot/reference/actuator/endpoints.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot Actuator endpoints</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/configuration.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI configuration reference</a>
- <a href="https://flywaydb.org/documentation/" target="_blank" rel="noopener" referrerpolicy="origin">Flyway documentation</a>
