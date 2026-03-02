---
title: Prompt templates in Spring AI — stop hardcoding your prompts
description: Hardcoded prompt strings in Java code are hard to review, impossible to change without a redeploy, and a maintenance nightmare at scale. Spring AI's PromptTemplate solves this. Here is how to use it properly.
pubDatetime: "2026-03-02T21:20:00+05:30"
tags:
  - spring-ai
  - prompt-engineering
  - java
---

Dev's support endpoint was working. The system prompt was a Java text block — a multi-line string right there in the `@Bean` method. When the product manager asked to tweak the wording, Dev had to open the IDE, edit Java code, rebuild, and redeploy.

Then it happened again for a different prompt. And again.

By the third time, Dev realised: prompts are configuration, not code. They should not live in `.java` files.

## Table of contents

## The problem with hardcoded prompts

A prompt string embedded in Java has several problems:

- **It requires a code change to update.** Wording tweaks, tone adjustments, and new constraints all go through the full build and deploy cycle.
- **It is hard to review.** A prompt buried in a `@Bean` method does not stand out in a pull request. Reviewers miss changes.
- **It mixes concerns.** The wiring of a Spring bean is a different concern from the instruction text the AI receives.
- **It is not testable in isolation.** You cannot run a prompt through different models without changing code.

```java
// ❌ Prompt buried in Java — hard to update, hard to review
@Bean
ChatClient chatClient(ChatClient.Builder builder) {
    return builder
            .defaultSystem("You are a helpful support assistant. Answer questions about " +
                           "products and orders. If you cannot help, say you don't know. " +
                           "Keep answers short. Only use provided context.")
            .build();
}
```

## What PromptTemplate provides

`PromptTemplate` is Spring AI's solution for externalizing prompts and injecting variables into them. It loads a template from a classpath resource and substitutes named variables at call time.

```java
// ✅ Prompt in a file, variables injected at runtime
PromptTemplate template = new PromptTemplate(
    new ClassPathResource("prompts/product-summary.st")
);

Prompt prompt = template.create(Map.of(
    "productName", "ProX Wireless Headphones",
    "audience", "first-time buyers"
));
```

The template file lives in `src/main/resources/prompts/` and uses `{variableName}` placeholders:

```
You are a product specialist for TechGadgets.

Write a concise product description for {audience} about the following product.
Use plain language. Highlight the top 3 benefits. Keep it under 100 words.

Product: {productName}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Name your prompt files descriptively after the task they perform, not the component that uses them: <code>classify-support-message.st</code>, <code>generate-product-description.st</code>, <code>summarize-customer-feedback.st</code>. This makes the prompts directory self-documenting.</p>
</blockquote>

## Setting up the prompts directory

Create the directory structure:

```
src/
  main/
    resources/
      prompts/
        support-system.st          ← the support assistant system prompt
        classify-message.st        ← message intent classification
        generate-summary.st        ← product summary generation
```

These files are plain text — no special format required beyond the `{variable}` placeholders.

## Using PromptTemplate for system prompts

For the system prompt, load it from a file rather than hardcoding it in the bean:

**`src/main/resources/prompts/support-system.st`:**
```
You are a customer support assistant for TechGadgets, an online electronics store.
Answer only questions about products, orders, shipping, and store policies.
Use only the information provided in the context below — do not invent product details.
If you cannot answer, say: "I don't have that information right now. Please contact support@techgadgets.com."
Keep responses concise — 2 to 4 sentences unless detail is explicitly requested.
```

**`AiConfig.java`:**
```java
@Configuration
class AiConfig {

    @Bean
    ChatClient chatClient(
            ChatClient.Builder builder,
            @Value("classpath:prompts/support-system.st") Resource systemPromptResource
    ) {
        return builder
                .defaultSystem(systemPromptResource)
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.2)
                        .maxTokens(400)
                        .build())
                .build();
    }
}
```

`ChatClient.Builder.defaultSystem()` accepts a `Resource` directly. Spring loads the file at startup and uses its text as the system prompt.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> The system prompt is loaded once at application startup. If you change the <code>.st</code> file, you still need to restart the application. But the change is a resource edit, not a code change — no compile step, and it is clearly visible in version control as a text file diff.</p>
</blockquote>

## Using PromptTemplate for dynamic user prompts

For prompts with variable content — a customer question, a product name, a chunk of retrieved text — use `PromptTemplate.create()`:

**`src/main/resources/prompts/classify-message.st`:**
```
Classify the following customer support message into exactly one of these categories:
PRODUCT_QUESTION, ORDER_STATUS, RETURN_REQUEST, COMPLAINT, COMPLIMENT, OTHER

Respond with only the category name — no explanation, no punctuation.

Message: {message}
```

**`ClassificationService.java`:**
```java
@Service
class ClassificationService {

    private final ChatClient chatClient;
    private final PromptTemplate classifyTemplate;

    ClassificationService(
            ChatClient chatClient,
            @Value("classpath:prompts/classify-message.st") Resource classifyPrompt
    ) {
        this.chatClient = chatClient;
        this.classifyTemplate = new PromptTemplate(classifyPrompt);
    }

    String classify(String customerMessage) {
        Prompt prompt = classifyTemplate.create(Map.of("message", customerMessage));
        return chatClient.prompt(prompt).call().content().strip();
    }
}
```

The `PromptTemplate.create(Map)` substitutes all `{variable}` placeholders and returns a `Prompt` object ready to pass to `chatClient.prompt(prompt)`.

## Multi-variable templates

Templates can have multiple variables. The product description generator uses two:

**`src/main/resources/prompts/generate-product-description.st`:**
```
You are a product copywriter for TechGadgets.

Write a product description for {audience} about the product below.
Highlight the top 3 benefits. Keep it under {maxWords} words. Use plain, friendly language.

Product details:
{productDetails}
```

```java
Prompt prompt = descriptionTemplate.create(Map.of(
    "audience", "budget-conscious shoppers",
    "maxWords", "80",
    "productDetails", productCatalogEntry
));

String description = chatClient.prompt(prompt).call().content();
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Variables in <code>PromptTemplate</code> are substituted with plain string replacement. If a variable value contains curly braces, escape them. For complex formatting, pre-process the data in Java before passing it to the template rather than adding complex logic to the template itself.</p>
</blockquote>

## Testing prompt templates in isolation

Because prompts live in files, you can test them directly without making a real LLM call:

```java
@SpringBootTest
class ClassificationServiceTest {

    @Autowired
    ClassificationService classificationService;

    @MockBean
    ChatClient chatClient;

    @Test
    void classifiesComplaintCorrectly() {
        when(chatClient.prompt(any(Prompt.class)))
                .thenReturn(mock(ChatClient.ChatClientRequestSpec.class,
                        ans -> "COMPLAINT"));

        String result = classificationService.classify(
            "My order arrived damaged and I want a replacement."
        );

        assertThat(result).isEqualTo("COMPLAINT");
    }
}
```

More importantly, you can inspect the generated `Prompt` directly to verify the template produced the expected text — without calling any external API:

```java
@Test
void templateSubstitutesVariablesCorrectly() {
    PromptTemplate template = new PromptTemplate(
        new ClassPathResource("prompts/classify-message.st")
    );

    Prompt prompt = template.create(Map.of("message", "Where is my order?"));
    String promptText = prompt.getContents();

    assertThat(promptText).contains("Where is my order?");
    assertThat(promptText).contains("ORDER_STATUS");
    assertThat(promptText).doesNotContain("{message}"); // variable was substituted
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> <code>PromptTemplate</code> does not validate at construction time that all variables in the template have values. A missing variable leaves the <code>{variableName}</code> placeholder literally in the prompt text. The model will try to interpret it, usually producing wrong output. Always test templates with the same variable set the production code uses.</p>
</blockquote>

## Checklist for externalizing prompts

1. Move all system prompt text to `src/main/resources/prompts/*.st` files.
2. Use `@Value("classpath:prompts/...")` to inject `Resource` references.
3. Use `PromptTemplate` + `.create(Map)` for any prompt with variable content.
4. Name template files after the task, not the class.
5. Add a test that loads each template and verifies variables are substituted correctly.
6. Review prompts as text file diffs in pull requests, separate from code changes.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Externalizing prompts is a discipline, not a technical requirement. Spring AI will work fine with hardcoded strings. The discipline pays off when prompts need to evolve — which they always do once real users start interacting with the system.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/prompt.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Prompt and PromptTemplate reference</a>
