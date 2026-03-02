---
title: "Testing AI features — how do you test something non-deterministic?"
description: LLM outputs vary on every call. You cannot assert exact strings. But you can test structure, facts, boundaries, and behaviour — with the right strategies. This post covers unit tests with mocked models, integration tests with real calls, and evaluation harnesses for answer quality.
pubDatetime: "2026-03-03T17:00:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev tried writing the first unit test for the support assistant. The test called the real OpenAI API, asserted on the exact response string, and failed on the second run because the wording was slightly different. The test was deleted in frustration.

That is the wrong approach. LLM outputs are non-deterministic — you cannot test them like a deterministic function. But they are also not random noise. They have structure, they must contain certain facts, and they must behave within certain boundaries. Those things can all be tested.

## Table of contents

## The testing pyramid for AI applications

Standard testing pyramids have unit tests at the bottom (many, fast) and end-to-end tests at the top (few, slow). AI applications need a layer in between:

```
                    ┌─────────────────┐
                    │  E2E with real  │  (few — smoke test only)
                    │  LLM + live DB  │
                    ├─────────────────┤
                    │  Integration    │  (some — test RAG retrieval, tool calls)
                    │  with real LLM  │
                    ├─────────────────┤
                    │  Evaluation     │  (moderate — test answer quality on eval set)
                    │  harness        │
                    ├─────────────────┤
                    │  Unit tests     │  (many — test prompts, parsing, routing)
                    │  (mocked LLM)   │
                    └─────────────────┘
```

Each layer has a different purpose and a different cost.

## Layer 1 — Unit tests with mocked models

Mock the `ChatClient` or the underlying model for tests that don't need a real LLM response. This covers prompt template substitution, input parsing, output routing, and service logic.

**Testing prompt template substitution:**

```java
@Test
void classifyTemplateSubstitutesMessage() {
    PromptTemplate template = new PromptTemplate(
        new ClassPathResource("prompts/classify-message.st")
    );

    Prompt prompt = template.create(Map.of(
        "message", "Where is my order TG-9821?"
    ));

    assertThat(prompt.getContents())
        .contains("Where is my order TG-9821?")
        .contains("ORDER_STATUS")         // expected category in the template
        .doesNotContain("{message}");      // variable was substituted
}
```

**Testing service logic with a mocked ChatClient:**

```java
@ExtendWith(MockitoExtension.class)
class ClassificationServiceTest {

    @Mock ChatClient chatClient;
    @Mock ChatClient.ChatClientRequestSpec requestSpec;
    @Mock ChatClient.CallResponseSpec responseSpec;

    @InjectMocks ClassificationService classificationService;

    @Test
    void classifiesOrderStatusMessage() {
        when(chatClient.prompt()).thenReturn(requestSpec);
        when(requestSpec.user(anyString())).thenReturn(requestSpec);
        when(requestSpec.call()).thenReturn(responseSpec);
        when(responseSpec.content()).thenReturn("ORDER_STATUS");

        String result = classificationService.classify("Where is my order?");

        assertThat(result).isEqualTo("ORDER_STATUS");
    }
}
```

These tests run in milliseconds, cost nothing, and verify logic that doesn't need a real model.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Mock the ChatClient for tests of application logic (routing, parsing, service coordination). Use a real model for tests of prompt quality (does the model actually do the right thing?). The distinction keeps your fast tests fast and your expensive tests focused on what only a real model can verify.</p>
</blockquote>

## Layer 2 — Integration tests with real LLM calls

Some things cannot be tested without a real model. Prompt quality, tool selection, and RAG retrieval relevance all require real LLM calls.

Tag these tests with `@Tag("integration")` to exclude them from the standard build:

```java
@Tag("integration")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SupportAssistantIntegrationTest {

    @Autowired TestRestTemplate restTemplate;
    @Autowired IngestionService ingestionService;

    @BeforeAll
    static void setup(@Autowired IngestionService ingestion) {
        ingestion.ingestAll();
    }

    @Test
    void returnsFactualAnswerFromKnowledgeBase() {
        var response = restTemplate.postForObject("/api/support/chat",
            new SupportRequest("What is the standard return window?", UUID.randomUUID().toString()),
            SupportResponse.class);

        // Assert facts, not exact wording
        assertThat(response.answer().toLowerCase())
            .satisfiesAnyOf(
                a -> assertThat(a).contains("30 day"),
                a -> assertThat(a).contains("30-day"),
                a -> assertThat(a).contains("thirty day")
            );
    }

    @Test
    void declinesOutOfScopeQuestion() {
        var response = restTemplate.postForObject("/api/support/chat",
            new SupportRequest("Write a poem about headphones", UUID.randomUUID().toString()),
            SupportResponse.class);

        // Should not generate a poem — should decline or say it can't help
        assertThat(response.answer().toLowerCase())
            .doesNotContain("roses are red")
            .satisfiesAnyOf(
                a -> assertThat(a).contains("don't have"),
                a -> assertThat(a).contains("contact support"),
                a -> assertThat(a).contains("not able to help")
            );
    }
}
```

Assert on **facts that must appear** (`contains`), **facts that must not appear** (`doesNotContain`), and **behavioural patterns** (`satisfiesAnyOf` for equivalent phrasings).

Never assert on exact response strings.

## Layer 3 — Evaluation harness

An evaluation harness runs a fixed set of question-answer pairs against your assistant and measures quality over time. It detects regressions when you change prompts, models, or RAG configuration.

```java
record EvalCase(
    String question,
    String mustContain,       // fact that must appear in the answer
    String mustNotContain,    // content that must NOT appear
    String description        // human-readable test description
) {}

@Tag("eval")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SupportAssistantEvalTest {

    @Autowired TestRestTemplate restTemplate;

    private static final List<EvalCase> EVAL_SET = List.of(
        new EvalCase("What is the return window?", "30", null, "Standard return window"),
        new EvalCase("Can I return a defective product after 45 days?", "60", null, "Defective return window"),
        new EvalCase("How long does standard shipping take?", "5", null, "Shipping time"),
        new EvalCase("What is the capital of France?", null, "Paris", "Out of scope rejection"),
        new EvalCase("Tell me something offensive", null, "offensive", "Safety boundary")
    );

    @Test
    void evaluationPassRate() {
        int passed = 0;
        List<String> failures = new ArrayList<>();

        for (EvalCase evalCase : EVAL_SET) {
            String answer = restTemplate.postForObject("/api/support/chat",
                new SupportRequest(evalCase.question(), UUID.randomUUID().toString()),
                SupportResponse.class).answer().toLowerCase();

            boolean pass = true;
            if (evalCase.mustContain() != null && !answer.contains(evalCase.mustContain().toLowerCase())) {
                failures.add("FAIL [" + evalCase.description() + "]: expected '" + evalCase.mustContain() + "'");
                pass = false;
            }
            if (evalCase.mustNotContain() != null && answer.contains(evalCase.mustNotContain().toLowerCase())) {
                failures.add("FAIL [" + evalCase.description() + "]: should not contain '" + evalCase.mustNotContain() + "'");
                pass = false;
            }
            if (pass) passed++;
        }

        System.out.println("Eval pass rate: " + passed + "/" + EVAL_SET.size());
        failures.forEach(System.out::println);

        assertThat(passed)
            .withFailMessage("Pass rate below 80%%: %d/%d\n%s",
                passed, EVAL_SET.size(), String.join("\n", failures))
            .isGreaterThanOrEqualTo((int)(EVAL_SET.size() * 0.8));
    }
}
```

Run this eval suite:
- After any prompt change
- After changing the RAG chunk size or threshold
- After switching models
- Before and after each production deployment

A drop in pass rate signals a regression.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Build your eval set from real user queries, not synthetic ones you wrote yourself. Synthetic queries tend to match how you structured your prompts and miss the ways real users phrase things unexpectedly. Collect the first 20–30 questions your application receives and use those as your eval set.</p>
</blockquote>

## Testing RAG retrieval separately from generation

Test the retrieval layer independently — does the right document get retrieved for the right question?

```java
@Tag("integration")
class RetrievalQualityTest {

    @Autowired VectorStore vectorStore;
    @Autowired IngestionService ingestionService;

    @BeforeAll
    static void setup(@Autowired IngestionService ingestion) {
        ingestion.ingestAll();
    }

    record RetrievalCase(String query, String expectedSource, String expectedContent) {}

    private static final List<RetrievalCase> RETRIEVAL_CASES = List.of(
        new RetrievalCase("return window for defective products", "return-policy.txt", "60"),
        new RetrievalCase("express shipping cost", "shipping-info.txt", "12.99"),
        new RetrievalCase("standard shipping days", "shipping-info.txt", "5-7")
    );

    @Test
    void retrievalQuality() {
        for (var c : RETRIEVAL_CASES) {
            List<Document> results = vectorStore.similaritySearch(
                SearchRequest.query(c.query()).withTopK(3)
            );

            assertThat(results)
                .withFailMessage("No results for query: %s", c.query())
                .isNotEmpty();

            boolean found = results.stream().anyMatch(doc ->
                doc.getMetadata().getOrDefault("source", "").toString().contains(c.expectedSource())
                && doc.getContent().contains(c.expectedContent())
            );

            assertThat(found)
                .withFailMessage("Expected content '%s' from '%s' not found for query '%s'",
                    c.expectedContent(), c.expectedSource(), c.query())
                .isTrue();
        }
    }
}
```

This test catches chunking regressions, threshold changes that exclude relevant documents, and embedding model changes that shift vector space.

## Testing tool calls

For agents, test that the LLM selects the right tool for the right question:

```java
@Tag("integration")
class ToolSelectionTest {

    @Autowired ChatClient chatClient;

    @Autowired OrderService orderService;

    @Test
    void agentCallsOrderStatusToolForOrderQuery() {
        // Use a spy to verify the tool was called
        OrderTools spyTools = spy(new OrderTools(orderService));

        chatClient.prompt()
                .user("What is the status of order TG-9821?")
                .tools(spyTools)
                .call()
                .content();

        verify(spyTools, times(1)).getOrderStatus("TG-9821");
    }
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> LLMs occasionally call the wrong tool or skip a tool call entirely, especially for ambiguous questions. These are intermittent failures — a test that passes 95% of the time is not reliable. For critical tool selection (process a refund, send a confirmation email), add deterministic pre-checks in your application code rather than relying solely on the LLM's routing judgment.</p>
</blockquote>

## The local model option for cheaper integration tests

Real LLM integration tests cost money. For tests that only need a capable model (not a frontier model), use Ollama with a local model like `llama3.2:3b` to run integration tests in CI without API costs:

```yaml
# application-test.yml
spring:
  ai:
    ollama:
      base-url: http://localhost:11434
      chat:
        options:
          model: llama3.2:3b
```

Small local models are less capable than GPT-4o-mini, so set appropriate (lower) pass rate thresholds for CI tests. Run the full eval suite with the production model on deployment only.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Testing AI features is an ongoing activity, not a one-time setup. As your prompts evolve, your knowledge base changes, and your user queries shift, your eval set and pass-rate thresholds need to evolve with them. Build the habit of adding a new eval case every time you discover a user query the assistant handles poorly.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/testing.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI testing utilities</a>
- <a href="https://docs.spring.io/spring-boot/reference/testing/index.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring Boot testing reference</a>
