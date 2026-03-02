---
title: Getting structured JSON responses from LLMs in Spring AI
description: LLMs return free-form text by default. Spring AI's structured output support maps that text directly into Java records and classes — no manual JSON parsing, no fragile string manipulation.
pubDatetime: "2026-03-02T21:40:00+05:30"
tags:
  - spring-ai
  - java
  - json
---

Dev built the classification endpoint. It worked, most of the time. But occasionally the model responded with "COMPLAINT." (with a period) or "This is a COMPLAINT" instead of just "COMPLAINT". The `.strip()` call handled trailing whitespace, but it did not handle the model deciding to add prose around the answer.

The root cause: asking an LLM to return a structured value by describing the format in English is brittle. The model will mostly comply — but not always.

The fix is structured output: tell Spring AI the exact Java type you want, and it handles the format instruction and parsing automatically.

## Table of contents

## The problem with free-form text responses

When you call `.call().content()`, you get a `String`. If you need structured data — a list, an object with multiple fields, a nested hierarchy — you have to parse that string yourself.

This creates three problems:

**Inconsistent format.** Without explicit formatting instructions, the model chooses how to represent the data. One call returns a numbered list, the next returns bullet points, the next returns a paragraph.

**Brittle parsing.** Any parsing code you write assumes a specific format. When the model deviates — and it will — parsing fails or produces garbage.

**Hallucinated fields.** The model may add or omit fields it was not asked for, silently corrupting the expected schema.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Never parse structured data out of an LLM response with string splits or regex. Use Spring AI's structured output support instead. It generates the format instruction automatically and performs the conversion with proper error handling.</p>
</blockquote>

## The .entity() method — the simplest approach

Spring AI's `CallResponseSpec` exposes an `.entity(Class<T>)` method that automatically:

1. Adds a JSON schema instruction to your prompt so the model knows the exact format required.
2. Parses the model's JSON response into the target type.

Define a Java record that represents the structure you want:

```java
record ProductSummary(
    String name,
    String category,
    double price,
    List<String> topFeatures,
    boolean inStock
) {}
```

Call `.entity()` instead of `.content()`:

```java
String productDescription = """
        Name: ProX Wireless Headphones
        Category: Audio
        Price: $149.99
        Features: Active noise cancellation, 30-hour battery, USB-C charging, foldable design
        Availability: In stock
        """;

ProductSummary summary = chatClient.prompt()
        .user("Extract the product information from the following text:\n\n" + productDescription)
        .call()
        .entity(ProductSummary.class);

System.out.println(summary.name());       // ProX Wireless Headphones
System.out.println(summary.price());      // 149.99
System.out.println(summary.inStock());    // true
System.out.println(summary.topFeatures()); // [Active noise cancellation, ...]
```

Spring AI sends a modified prompt that instructs the model to respond in JSON matching the schema derived from `ProductSummary`. The response is then deserialized into the record automatically.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Java records are ideal as structured output types — they are concise, immutable, and their field names map cleanly to JSON keys. Spring AI uses Jackson under the hood, so standard Jackson annotations like <code>@JsonProperty</code> work if you need to customize field names.</p>
</blockquote>

## Structured output for lists

Use `ParameterizedTypeReference` when the output is a list of objects:

```java
record ProductTag(String tag, String reason) {}

List<ProductTag> tags = chatClient.prompt()
        .user("""
              Generate 5 relevant product tags for the following item.
              For each tag, include a one-sentence reason it applies.

              Product: ProX Wireless Headphones — 30hr battery, ANC, USB-C, foldable
              """)
        .call()
        .entity(new ParameterizedTypeReference<List<ProductTag>>() {});

tags.forEach(t -> System.out.println(t.tag() + ": " + t.reason()));
```

## Using BeanOutputConverter for more control

`.entity()` is the high-level convenience method. `BeanOutputConverter` is the lower-level building block it uses under the hood. You reach for it when you need to inspect the generated format string, combine it with a `PromptTemplate`, or add it to an existing prompt manually.

```java
BeanOutputConverter<ProductSummary> converter =
        new BeanOutputConverter<>(ProductSummary.class);

// The format instruction Spring AI generates — append it to your prompt
String formatInstruction = converter.getFormat();

PromptTemplate template = new PromptTemplate(
        new ClassPathResource("prompts/extract-product.st")
);

Prompt prompt = template.create(Map.of(
        "productText", rawProductText,
        "format", formatInstruction
));

String rawResponse = chatClient.prompt(prompt).call().content();
ProductSummary result = converter.convert(rawResponse);
```

**`src/main/resources/prompts/extract-product.st`:**
```
Extract the product information from the text below.

Product text:
{productText}

{format}
```

The `{format}` variable receives the generated JSON schema instruction. The model reads it and formats its response accordingly.

## Handling validation and errors

Structured output is more reliable than free-form parsing, but the model can still fail to produce valid JSON — especially with complex schemas or very small models (like some local Ollama models).

Always handle conversion failures gracefully:

```java
@Service
class ProductExtractionService {

    private final ChatClient chatClient;

    ProductExtractionService(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    Optional<ProductSummary> extract(String rawText) {
        try {
            ProductSummary summary = chatClient.prompt()
                    .user("Extract product info from:\n\n" + rawText)
                    .call()
                    .entity(ProductSummary.class);
            return Optional.of(summary);
        } catch (Exception e) {
            log.warn("Failed to extract structured product info: {}", e.getMessage());
            return Optional.empty();
        }
    }
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Local models (Ollama) are less reliable at producing valid JSON than frontier models. If your application must use a local model for privacy reasons, validate the output explicitly after parsing and add a retry or fallback path for malformed responses.</p>
</blockquote>

## Practical example: classifying support messages

Replace the fragile string-based classifier from earlier with structured output:

```java
record Classification(
    String category,       // PRODUCT_QUESTION | ORDER_STATUS | RETURN_REQUEST | COMPLAINT | OTHER
    String reasoning,      // one sentence explaining the classification
    int confidenceScore    // 1-10
) {}

@Service
class MessageClassifier {

    private final ChatClient chatClient;

    MessageClassifier(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    Classification classify(String message) {
        return chatClient.prompt()
                .user("""
                      Classify the following customer support message.
                      Category must be one of: PRODUCT_QUESTION, ORDER_STATUS, RETURN_REQUEST, COMPLAINT, OTHER.
                      Confidence score is 1 (very unsure) to 10 (completely sure).

                      Message: %s
                      """.formatted(message))
                .call()
                .entity(Classification.class);
    }
}
```

This approach gives you three pieces of data instead of one string: the category, the reasoning (useful for debugging edge cases), and a confidence score (useful for deciding whether to escalate to a human agent).

## Schema design tips

Well-designed output schemas produce better results:

| Good practice | Example |
|---|---|
| Use descriptive field names | `topFeatures` not `f` |
| Use enums as strings with valid values in the prompt | "Must be one of: X, Y, Z" |
| Keep nesting shallow | 2 levels max; deep nesting confuses smaller models |
| Use primitive types where possible | `double price` not `String priceFormatted` |
| Keep lists short | Ask for top 3-5 items, not unlimited |

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Structured output does not eliminate the need for good prompts. If your prompt is vague, the model will make up plausible-sounding values for your schema fields. Structured output solves the parsing problem — prompt design still solves the accuracy problem.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/structured-output-converter.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI structured output reference</a>
