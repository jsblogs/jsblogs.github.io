---
title: Combining RAG and tool calling in one Spring AI agent
description: RAG retrieves knowledge from documents. Tools retrieve live data from systems. Most production AI assistants need both. This post shows how QuestionAnswerAdvisor and @Tool methods compose naturally in Spring AI, and how the LLM decides which to use.
pubDatetime: "2026-03-03T15:40:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

A customer asked: "My ProX headphones from order TG-9821 stopped working after two weeks. Am I covered under warranty and how do I claim it?"

This question requires two things:
1. **Warranty policy** — what does TechGadgets' warranty actually cover? That's in the knowledge base (RAG).
2. **Order data** — was this order placed recently enough to still be under warranty? That's in the live system (tools).

Neither RAG nor tools alone can answer this question correctly. Both are needed.

## Table of contents

## Why they compose naturally

`QuestionAnswerAdvisor` and `@Tool` methods operate at different layers of the `ChatClient` call:

- The **advisor** runs before the LLM call — it retrieves documents and injects them as context in the prompt
- The **tool** runs during the LLM call — the LLM requests a tool call, Spring AI executes it, and the result flows back to the LLM

There is no conflict. The LLM receives both the retrieved knowledge base context and the ability to call tools. It uses whatever is appropriate for each part of the question.

```java
@Bean
ChatClient supportClient(
        ChatClient.Builder builder,
        VectorStore vectorStore,
        ChatMemory chatMemory,
        OrderTools orderTools,
        ProductTools productTools
) {
    return builder
            .defaultSystem(new ClassPathResource("prompts/support-system.st"))
            .defaultAdvisors(
                new QuestionAnswerAdvisor(vectorStore, SearchRequest.defaults().withTopK(5)),
                MessageChatMemoryAdvisor.builder(chatMemory).conversationWindowSize(20).build()
            )
            .defaultTools(orderTools, productTools)    // both tool classes registered
            .defaultOptions(OpenAiChatOptions.builder()
                    .model("gpt-4o-mini")
                    .temperature(0.2)
                    .maxTokens(600)
                    .build())
            .build();
}
```

## Adding a product tool

For the warranty question, the assistant also needs to look up the specific product to confirm what the warranty covers. Add a product tool:

```java
@Component
class ProductTools {

    private final ProductService productService;

    ProductTools(ProductService productService) {
        this.productService = productService;
    }

    @Tool(description = """
            Look up a product by its product ID to get name, specifications,
            warranty period, and warranty terms.
            Use when the customer asks about a specific product's details or warranty coverage.
            """)
    ProductDetails getProductDetails(
            @ToolParam(description = "The product ID, e.g. PRX-2024") String productId
    ) {
        return productService.findById(productId)
                .map(p -> new ProductDetails(
                    p.getId(), p.getName(), p.getSpecs(),
                    p.getWarrantyMonths(), p.getWarrantyTerms()
                ))
                .orElse(null);
    }

    record ProductDetails(
            String productId,
            String name,
            Map<String, String> specs,
            int warrantyMonths,
            String warrantyTerms
    ) {}
}
```

## The system prompt for combined RAG + tools

Update the system prompt to guide the LLM on when to use each capability:

```
You are a customer support assistant for TechGadgets, an online electronics store.

You have two sources of information:

1. CONTEXT (provided below): TechGadgets policies, general product information, FAQs.
   Use this for questions about store policies, return windows, shipping, general product features.

2. TOOLS (call as needed): Live order data and specific product details.
   - Use getOrderStatus when a customer asks about a specific order's delivery or status.
   - Use checkRefundEligibility when a customer asks about returns or refunds for a specific order.
   - Use getProductDetails when the customer needs specifications or warranty terms for a specific product.

For warranty claims:
- Look up the order to confirm purchase date and product
- Look up the product to confirm warranty period and terms
- Check the policy context for the claim process

If neither context nor tools provide the answer, say: "I don't have that information."
Keep responses concise unless detail is explicitly requested.
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> When the LLM has both RAG context and tools, explicitly tell it when to use each. Without guidance, it may over-rely on one or ignore the other. Structured system prompt sections ("Use CONTEXT for X, use TOOLS for Y") reliably steer the LLM's decision-making.</p>
</blockquote>

## Tracing a warranty question through the system

For "My ProX headphones from order TG-9821 stopped working. Am I covered under warranty?":

**Step 1 — QuestionAnswerAdvisor runs (before the LLM call):**
```
Search: "ProX headphones warranty stopped working"
Retrieved: [warranty-terms.txt chunk: "Electronics carry a 12-month manufacturer's warranty...
            Warranty covers defects in materials and workmanship...
            To claim: contact support with order number and describe the defect..."]
```

**Step 2 — LLM receives the full prompt:**
```
[System prompt: ...warrant guidance...]
[RAG context: warranty terms from warranty-terms.txt]
[User]: My ProX headphones from order TG-9821 stopped working. Am I covered?
```

**Step 3 — LLM calls tools:**
```
Tool call 1: getOrderStatus("TG-9821")
→ Order{orderedDate=5 weeks ago, items=[{productId=PRX-2024, name=ProX Wireless Headphones}]}

Tool call 2: getProductDetails("PRX-2024")
→ ProductDetails{warrantyMonths=12, warrantyTerms="Covers defects in materials and workmanship..."}
```

**Step 4 — LLM generates the final answer:**
```
"Your ProX Wireless Headphones from order TG-9821 (purchased 5 weeks ago) are within the
12-month manufacturer's warranty. Stopping working without physical damage qualifies as a
defect in materials or workmanship.

To claim your warranty:
1. Contact support with your order number TG-9821
2. Describe the issue (headphones stopped working)
3. Our team will arrange a replacement or repair

You can start the process at support.techgadgets.com/warranty."
```

The answer combines:
- Warranty period from the product tool (12 months)
- Purchase date from the order tool (5 weeks ago — within warranty)
- Claim process from the knowledge base (RAG)

Neither source alone could have answered this completely.

## Avoiding redundant tool calls

When the LLM has relevant context from RAG, it should not call tools redundantly. A well-written system prompt prevents this:

```
User: "What is TechGadgets' general return policy?"
```

This question is answered entirely by the knowledge base. With the system prompt above, the LLM should use the RAG context and not call any tools. Verify this by checking `SimpleLoggerAdvisor` output — zero tool calls should appear.

If you see the LLM calling tools for questions that the knowledge base answers, strengthen the system prompt:
```
Use CONTEXT for all policy questions — do not call tools for information already provided in context.
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Each unnecessary tool call adds latency (one extra LLM round-trip) and cost. In high-throughput applications, unnecessary tool calls are a performance problem. Monitor tool call frequency with <code>SimpleLoggerAdvisor</code> in staging and refine the system prompt if the LLM over-calls tools.</p>
</blockquote>

## Managing token usage with RAG + tools + memory

With all three capabilities active, the prompt grows on every request:
- **System prompt**: ~200 tokens
- **RAG context** (5 chunks × ~100 tokens): ~500 tokens
- **Conversation history** (window of 20 messages): ~2,000 tokens
- **Tool definitions** (3 tools × ~100 tokens): ~300 tokens
- **User message**: ~50 tokens

A fully-loaded request is roughly 3,000 tokens of input before the LLM generates anything. At $0.15 per million tokens (gpt-4o-mini), that is $0.00045 per request — negligible at moderate volume but worth tracking at scale.

```java
// Log token usage per request
ChatResponse response = chatClient.prompt()
        .user(question)
        .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId))
        .call()
        .chatResponse();

Usage usage = response.getMetadata().getUsage();
log.info("Tokens — input: {}, output: {}, total: {}",
    usage.getPromptTokens(), usage.getGenerationTokens(), usage.getTotalTokens());
```

Set up a Micrometer counter in production to track token usage over time. Module 7 covers this in detail.

## The complete picture

The TechGadgets support assistant now handles:

| Question type | Capability used |
|---|---|
| "What is your return policy?" | RAG (knowledge base) |
| "Where is my order TG-9821?" | Tool (live order status) |
| "Am I eligible for a refund?" | Tool (refund eligibility) |
| "Tell me about ProX headphones" | RAG (product info from docs) |
| "Are my headphones under warranty?" | RAG + Tools (policy + order + product) |
| "What about the order I mentioned earlier?" | Memory (conversation history) |

All of this runs through one `ChatClient` bean, one controller endpoint, and one streaming SSE endpoint. The LLM decides what to use for each question.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The final Module 6 post takes a step back from Spring AI code to discuss agent design patterns: when a simple prompt chain outperforms a full agent, the failure modes of multi-step agents, and how to think about reliability when the LLM controls your application flow.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/tools.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Tools reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_question_answer_advisor" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI QuestionAnswerAdvisor reference</a>
