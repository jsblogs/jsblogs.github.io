---
title: Building a document Q&A chatbot with Spring AI and RAG
description: This post assembles all of Module 3 and 4 into one working application — ingestion pipeline, pgvector storage, QuestionAnswerAdvisor, streaming responses, and a simple chat interface. By the end, you have a chatbot that answers from your own documents.
pubDatetime: "2026-03-03T12:40:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev had all the pieces: pgvector with documents indexed, `QuestionAnswerAdvisor` wired to `ChatClient`, streaming endpoint ready. Time to assemble them into one application that a product manager could actually use.

This post is the capstone of Module 4. No new concepts — just wiring everything together into a complete, runnable chatbot.

## Table of contents

## What we are building

A document Q&A chatbot that:
- Answers questions about TechGadgets' policies and products
- Grounds every answer in indexed documents (no hallucinated policies)
- Streams responses for a responsive UI
- Provides a minimal HTML/JS chat interface for testing
- Has an ingestion endpoint to reload knowledge base documents

The full project runs with `docker compose up` (for pgvector) and `./mvnw spring-boot:run`.

## Project structure

```
src/
  main/
    java/com/techgadgets/support/
      SupportApplication.java
      config/
        AiConfig.java           ← ChatClient + advisor wiring
      ingestion/
        IngestionService.java   ← ETL pipeline
        IngestionController.java← admin ingest endpoint
      chat/
        SupportController.java  ← chat endpoints (streaming + blocking)
    resources/
      application.yml
      prompts/
        support-system.st       ← system prompt
      knowledge-base/
        return-policy.txt
        shipping-info.txt
        warranty-terms.txt
        product-faq.txt
      static/
        index.html              ← minimal chat UI
```

## The application configuration

**`AiConfig.java`:**

```java
@Configuration
class AiConfig {

    @Bean
    ChatClient supportClient(
            ChatClient.Builder builder,
            VectorStore vectorStore
    ) {
        return builder
                .defaultSystem(new ClassPathResource("prompts/support-system.st"))
                .defaultAdvisors(
                    new QuestionAnswerAdvisor(
                        vectorStore,
                        SearchRequest.defaults()
                            .withTopK(5)
                            .withSimilarityThreshold(0.7)
                    )
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

**`src/main/resources/prompts/support-system.st`:**

```
You are a customer support assistant for TechGadgets, an online electronics store.

Answer questions about products, orders, shipping, and store policies.
Use ONLY the information provided in the context below — do not use prior knowledge.
If the answer is not in the context, respond with exactly:
"I don't have that information. For further help, contact support@techgadgets.com."

Guidelines:
- Keep answers concise: 2–4 sentences unless detail is explicitly requested
- Use plain language, avoid jargon
- If multiple policies apply, mention all of them
- Never mention that you are using a knowledge base or context documents
```

## The ingestion pipeline

**`IngestionService.java`:**

```java
@Service
@Slf4j
class IngestionService {

    private final VectorStore vectorStore;
    private final TokenTextSplitter splitter;

    IngestionService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
        this.splitter = new TokenTextSplitter(400, 100, 5, 10000, true);
    }

    int ingestAll() {
        PathMatchingResourcePatternResolver resolver =
                new PathMatchingResourcePatternResolver();

        Resource[] resources;
        try {
            resources = resolver.getResources("classpath:knowledge-base/*.txt");
        } catch (IOException e) {
            throw new RuntimeException("Cannot load knowledge base resources", e);
        }

        int total = 0;
        for (Resource resource : resources) {
            int count = ingestFile(resource);
            total += count;
            log.info("Ingested {} chunks from {}", count, resource.getFilename());
        }
        return total;
    }

    private int ingestFile(Resource resource) {
        List<Document> raw = new TextReader(resource).get();
        raw.forEach(doc ->
            doc.getMetadata().put("source", resource.getFilename())
        );

        List<Document> chunks = splitter.apply(raw);
        vectorStore.add(chunks);
        return chunks.size();
    }
}
```

**`IngestionController.java`:**

```java
@RestController
@RequestMapping("/admin")
class IngestionController {

    private final IngestionService ingestionService;

    IngestionController(IngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    @PostMapping("/ingest")
    ResponseEntity<String> ingest() {
        int count = ingestionService.ingestAll();
        return ResponseEntity.ok("Ingested " + count + " chunks from knowledge base.");
    }
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> For the first run, you can trigger ingestion automatically on startup using <code>@EventListener(ApplicationReadyEvent.class)</code>. For production, keep ingestion manual or scheduled — automatic re-ingestion on every startup duplicates chunks unless you delete existing ones first.</p>
</blockquote>

## The chat controller

**`SupportController.java`:**

```java
@RestController
@RequestMapping("/api/support")
class SupportController {

    private final ChatClient chatClient;

    SupportController(@Qualifier("supportClient") ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    // Blocking — for API consumers
    @PostMapping("/chat")
    SupportResponse chat(@RequestBody SupportRequest request) {
        String answer = chatClient.prompt()
                .user(request.question())
                .call()
                .content();
        return new SupportResponse(answer);
    }

    // Streaming — for the browser chat UI
    @GetMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    Flux<String> chatStream(@RequestParam String question) {
        return chatClient.prompt()
                .user(question)
                .stream()
                .content();
    }
}

record SupportRequest(String question) {}
record SupportResponse(String answer) {}
```

## The chat UI

A minimal HTML/JS interface that uses the streaming endpoint. Put this in `src/main/resources/static/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TechGadgets Support</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; }
    #messages { border: 1px solid #ddd; border-radius: 8px; padding: 16px;
                min-height: 300px; margin-bottom: 12px; background: #fafafa; }
    .message { margin: 8px 0; line-height: 1.5; }
    .user { color: #1a73e8; font-weight: 500; }
    .assistant { color: #333; }
    #form { display: flex; gap: 8px; }
    #input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
    button { padding: 10px 20px; background: #1a73e8; color: white;
             border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
  </style>
</head>
<body>
  <h2>TechGadgets Support Assistant</h2>
  <div id="messages"></div>
  <form id="form">
    <input id="input" placeholder="Ask a question about returns, shipping, or products..." autocomplete="off">
    <button type="submit">Send</button>
  </form>

  <script>
    const messages = document.getElementById('messages');
    const form = document.getElementById('form');
    const input = document.getElementById('input');

    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = `message ${role}`;
      div.textContent = (role === 'user' ? 'You: ' : 'Assistant: ') + text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const question = input.value.trim();
      if (!question) return;

      input.value = '';
      addMessage('user', question);

      const assistantDiv = addMessage('assistant', '');
      let responseText = '';

      const url = `/api/support/chat/stream?question=${encodeURIComponent(question)}`;
      const source = new EventSource(url);

      source.onmessage = (event) => {
        responseText += event.data;
        assistantDiv.textContent = 'Assistant: ' + responseText;
        messages.scrollTop = messages.scrollHeight;
      };

      source.onerror = () => {
        source.close();
        if (!responseText) {
          assistantDiv.textContent = 'Assistant: Sorry, something went wrong.';
        }
      };
    });
  </script>
</body>
</html>
```

Open `http://localhost:8080` and the chat interface is ready.

## application.yml

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/supportapp
    username: supportuser
    password: supportpass

  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      embedding:
        options:
          model: text-embedding-3-small

    vectorstore:
      pgvector:
        initialize-schema: true
        index-type: HNSW
        distance-type: COSINE_DISTANCE
        dimensions: 1536

logging:
  level:
    com.techgadgets: DEBUG
    org.springframework.ai: INFO
```

## The knowledge base documents

Create these in `src/main/resources/knowledge-base/`:

**`return-policy.txt`:**
```
TechGadgets Return Policy

Standard Return Window:
Items can be returned within 30 days of delivery for a full refund.
Items must be unused, in original packaging, with all accessories included.

Electronics Return Window:
Defective electronics qualify for a 60-day return or exchange.
Electronics that have been activated follow the standard 30-day window unless defective.

How to Return:
Visit support.techgadgets.com/returns and enter your order number.
A prepaid return label will be emailed within 2 hours.
Refunds are processed within 5-7 business days after the item is received.
```

**`shipping-info.txt`:**
```
TechGadgets Shipping Information

Standard Shipping: 5-7 business days, free on orders over $50, $4.99 otherwise.
Express Shipping: 2-3 business days, $12.99.
Next-Day Delivery: Available in select ZIP codes, $24.99, order before 2 PM EST.
International Shipping: Available to 45 countries, 7-14 business days.

Order tracking is available at techgadgets.com/track.
Orders placed before 2 PM EST ship same day.
```

## Running the full application

```bash
# Start pgvector
docker compose up -d

# Set API key
export OPENAI_API_KEY=sk-...

# Start the application
./mvnw spring-boot:run

# Trigger ingestion (first run only)
curl -X POST http://localhost:8080/admin/ingest

# Open the chat interface
open http://localhost:8080
```

Ask: "What is the return window for a defective product?" The assistant should answer "60 days" — from the indexed policy, not from a generic training answer.

## Testing the RAG behaviour

A focused integration test verifies end-to-end RAG behaviour:

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RagIntegrationTest {

    @Autowired
    TestRestTemplate restTemplate;

    @Autowired
    IngestionService ingestionService;

    @BeforeAll
    void setup() {
        ingestionService.ingestAll();
    }

    @Test
    void answersFromKnowledgeBase() {
        var request = new SupportRequest("How long is the return window for defective electronics?");
        var response = restTemplate.postForObject(
            "/api/support/chat", request, SupportResponse.class
        );

        assertThat(response.answer()).containsIgnoringCase("60");
    }

    @Test
    void declinesOutOfScopeQuestions() {
        var request = new SupportRequest("What is the capital of France?");
        var response = restTemplate.postForObject(
            "/api/support/chat", request, SupportResponse.class
        );

        assertThat(response.answer()).containsIgnoringCase("don't have");
    }
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> RAG integration tests make real API calls and cost money. Tag them with a custom JUnit annotation (like <code>@Tag("integration")</code>) and exclude them from the default test run. Run them in a dedicated CI stage or manually before production deploys.</p>
</blockquote>

## What this application demonstrates

The TechGadgets support assistant now:

1. **Grounds answers** — every response comes from indexed policy documents
2. **Declines gracefully** — off-topic questions get a consistent fallback
3. **Streams responses** — browser UI shows text typing in real time
4. **Is updatable** — change a document and re-run the ingest endpoint
5. **Is auditable** — `SimpleLoggerAdvisor` shows exactly what context was retrieved

The next post covers improving RAG quality further: reranking retrieved results and hybrid search that combines vector and keyword search for better recall.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The application has no conversation memory yet — each question is independent. Module 5 adds memory so the assistant can reference earlier turns in the conversation. "My last order" becomes meaningful context instead of an unknown reference.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_question_answer_advisor" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI QuestionAnswerAdvisor reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/etl-pipeline.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ETL Pipeline reference</a>
