---
title: Setting up Spring AI in a Spring Boot project — step by step
description: Module 2 starts with code. This post walks through adding Spring AI to a Spring Boot project, configuring OpenAI and Ollama, and making your first real LLM API call from Java.
pubDatetime: "2026-03-02T20:40:00+05:30"
tags:
  - springboot
  - spring-ai
  - java
---

Dev had the mental model. Tokens, context windows, temperature, prompts — all clear. Time to open the IDE.

The first question: how do you actually connect a Spring Boot application to an LLM? The answer turns out to be remarkably familiar — a starter dependency, a few properties, and an injected bean. If you have set up Spring Data or Spring Security before, Spring AI follows the same pattern.

This post gets you from a blank Spring Boot project to a working LLM API call.

## Table of contents

## Project prerequisites

Before adding Spring AI, confirm your project has:
- Java 21 (Spring AI requires Java 17+, but this course uses Java 21 features)
- Spring Boot 3.3 or later
- Maven 3.9+

If you are starting fresh, generate a project at [start.spring.io](https://start.spring.io) with Spring Boot 3.x, Java 21, and the Web dependency.

## Step 1 — Add the Spring AI BOM

Spring AI uses a BOM (Bill of Materials) to manage consistent dependency versions. Add it to your `pom.xml` under `<dependencyManagement>`:

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.ai</groupId>
            <artifactId>spring-ai-bom</artifactId>
            <version>1.0.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

## Step 2 — Add the model starter dependency

Choose the model provider you want to use. For this course we use OpenAI in staging/production and Ollama locally. Add the starter — no version needed because the BOM manages it:

**OpenAI:**
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-openai</artifactId>
</dependency>
```

**Ollama (for local development):**
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-ollama</artifactId>
</dependency>
```

You can have both in the same project and switch between them using Spring profiles. We will set that up shortly.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Never commit your API key to source control. Store it as an environment variable and reference it in properties with <code>${OPENAI_API_KEY}</code>. If you accidentally expose an API key, rotate it immediately at platform.openai.com.</p>
</blockquote>

## Step 3 — Configure the model

**For OpenAI** (`src/main/resources/application.properties`):

```properties
spring.ai.openai.api-key=${OPENAI_API_KEY}
spring.ai.openai.chat.options.model=gpt-4o-mini
spring.ai.openai.chat.options.temperature=0.2
spring.ai.openai.chat.options.max-tokens=500
```

**For Ollama** — first, install and run Ollama:

```bash
# macOS
brew install ollama
ollama serve

# Pull a model (one-time download, ~2-4 GB)
ollama pull llama3.2
```

Then in `application-dev.properties` (used when `spring.profiles.active=dev`):

```properties
spring.ai.ollama.base-url=http://localhost:11434
spring.ai.ollama.chat.options.model=llama3.2
spring.ai.ollama.chat.options.temperature=0.2
```

To use the dev profile locally:
```bash
SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use Ollama during development and CI — it is free, works offline, and requires no API key. Switch to OpenAI only in staging and production where output quality matters. This alone can reduce your AI spend to near zero during development.</p>
</blockquote>

## Step 4 — Verify auto-configuration

Spring AI auto-configures a `ChatClient.Builder` bean when it detects the right starter and properties. Check your application starts without errors:

```bash
./mvnw spring-boot:run
```

If you see an error like `Could not resolve placeholder 'OPENAI_API_KEY'`, the environment variable is not set. Export it first:

```bash
export OPENAI_API_KEY=sk-your-key-here
./mvnw spring-boot:run
```

## Step 5 — Make your first LLM call

Inject `ChatClient.Builder`, build a `ChatClient`, and make a call:

```java
@RestController
class HelloAiController {

    private final ChatClient chatClient;

    HelloAiController(ChatClient.Builder builder) {
        this.chatClient = builder.build();
    }

    @GetMapping("/ai/hello")
    String hello(@RequestParam String question) {
        return chatClient.prompt()
                .user(question)
                .call()
                .content();
    }
}
```

Start the app and test it:

```bash
curl "http://localhost:8080/ai/hello?question=What+is+Spring+Boot+in+one+sentence"
```

You should get a one-sentence response from the model. If you do, the integration is working.

## Step 6 — Configure a shared ChatClient bean

For production code, configure a `ChatClient` bean with shared defaults rather than building a new one per controller:

```java
@Configuration
class AiConfig {

    @Bean
    ChatClient chatClient(ChatClient.Builder builder) {
        return builder
                .defaultSystem("""
                        You are a helpful customer support assistant for TechGadgets, an online electronics store.
                        Answer only questions about products, orders, and store policies.
                        If you cannot answer from the provided context, say: "I don't have that information right now."
                        Keep responses concise — 2 to 4 sentences unless more detail is explicitly requested.
                        """)
                .build();
    }
}
```

Inject this bean wherever you need it:

```java
@Service
class SupportService {

    private final ChatClient chatClient;

    SupportService(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    String answer(String customerQuestion) {
        return chatClient.prompt()
                .user(customerQuestion)
                .call()
                .content();
    }
}
```

The system prompt is set once in the bean. All calls through this client use it automatically.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Do not put your system prompt text directly in the <code>@Bean</code> method as a hardcoded string in production code. Move it to a <code>.st</code> file in <code>src/main/resources/prompts/</code>. The next post covers this with <code>PromptTemplate</code>.</p>
</blockquote>

## Setup checklist

1. Add `spring-ai-bom` to `<dependencyManagement>` with the target version.
2. Add the model starter (`spring-ai-starter-model-openai` or `spring-ai-starter-model-ollama`).
3. Set API key via environment variable — never hardcode.
4. Configure model name and temperature in `application.properties`.
5. Create a `ChatClient` `@Bean` with a default system prompt.
6. Verify: start the app, hit one endpoint, confirm a response comes back.
7. Set up Spring profiles: `dev` → Ollama, `prod` → OpenAI.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The entire setup takes about 10 minutes for a developer who has done Spring Boot before. If something is not working, check the auto-configuration report: start the app with <code>--debug</code> and search for <code>OpenAiAutoConfiguration</code> or <code>OllamaAutoConfiguration</code> to see what was matched and what was skipped.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/getting-started.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI getting started guide</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/chatclient.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ChatClient reference</a>
- <a href="https://ollama.com/library" target="_blank" rel="noopener" referrerpolicy="origin">Ollama model library</a>
