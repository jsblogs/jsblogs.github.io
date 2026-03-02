---
title: Building an AI agent that checks order status — a step-by-step example
description: This post builds a complete Spring AI agent that fetches live order data from a service, assesses refund eligibility, and provides actionable answers — all in a single conversation turn. The full application wires tools, RAG, and memory together.
pubDatetime: "2026-03-03T15:20:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

"My order TG-9821 hasn't arrived and it's two days late. Am I eligible for a refund?"

Before agents, the assistant would say "please contact support@techgadgets.com for order-related questions." After agents, it checks the live order status, evaluates refund eligibility, and gives a specific, actionable answer — all in the same message.

This post builds the complete implementation.

## Table of contents

## The domain — order management services

The support assistant needs access to real order data. First, define the domain objects and a service interface:

```java
// Domain records
record Order(
    String orderId,
    String customerId,
    String status,                    // PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED
    String carrier,
    String trackingNumber,
    LocalDate orderedDate,
    LocalDate estimatedDelivery,
    LocalDate actualDelivery,
    List<OrderItem> items,
    BigDecimal total
) {}

record OrderItem(String productId, String productName, int quantity, BigDecimal price) {}

record RefundEligibility(
    boolean eligible,
    String reason,
    BigDecimal refundAmount,
    String instructions
) {}
```

```java
// Service interface — in production this calls your order management system
@Service
class OrderService {

    // Simulated data — replace with real DB/API calls
    private final Map<String, Order> orders = Map.of(
        "TG-9821", new Order(
            "TG-9821", "CUST-001", "SHIPPED", "FedEx", "TRK-44821",
            LocalDate.now().minusDays(5),
            LocalDate.now().minusDays(1),   // estimated: yesterday
            null,                           // not yet delivered
            List.of(new OrderItem("PRX-2024", "ProX Wireless Headphones", 1, new BigDecimal("149.99"))),
            new BigDecimal("149.99")
        )
    );

    Order findOrder(String orderId) {
        return orders.get(orderId.toUpperCase());
    }

    RefundEligibility checkRefundEligibility(String orderId) {
        Order order = findOrder(orderId);
        if (order == null) {
            return new RefundEligibility(false, "Order not found", BigDecimal.ZERO, null);
        }

        return switch (order.status()) {
            case "DELIVERED" -> {
                long daysSinceDelivery = ChronoUnit.DAYS.between(order.actualDelivery(), LocalDate.now());
                boolean eligible = daysSinceDelivery <= 30;
                yield new RefundEligibility(
                    eligible,
                    eligible ? "Within 30-day return window" : "Return window has expired",
                    eligible ? order.total() : BigDecimal.ZERO,
                    eligible ? "Visit support.techgadgets.com/returns with your order number" : null
                );
            }
            case "SHIPPED" -> new RefundEligibility(
                false, "Order is in transit — wait for delivery then assess",
                BigDecimal.ZERO, "Track at " + order.carrier() + " using " + order.trackingNumber()
            );
            case "CANCELLED" -> new RefundEligibility(
                true, "Cancelled orders are automatically refunded",
                order.total(), "Refund will process within 5-7 business days"
            );
            default -> new RefundEligibility(false, "Order is still processing", BigDecimal.ZERO, null);
        };
    }
}
```

## The tool class

```java
@Component
class OrderTools {

    private final OrderService orderService;

    OrderTools(OrderService orderService) {
        this.orderService = orderService;
    }

    @Tool(description = """
            Look up an order by its order ID to get status, carrier, tracking number,
            estimated delivery date, and items ordered.
            Use when the customer asks about order status, delivery, or tracking.
            """)
    Order getOrderStatus(
            @ToolParam(description = "The order ID, typically in format TG-XXXX") String orderId
    ) {
        Order order = orderService.findOrder(orderId);
        if (order == null) {
            return null;   // LLM will handle the null case
        }
        return order;
    }

    @Tool(description = """
            Check if an order is eligible for a refund or return.
            Returns eligibility status, reason, refund amount, and instructions.
            Use when the customer asks about refunds, returns, or compensation for late delivery.
            """)
    RefundEligibility checkRefundEligibility(
            @ToolParam(description = "The order ID to check refund eligibility for") String orderId
    ) {
        return orderService.checkRefundEligibility(orderId);
    }
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Multi-line tool descriptions using text blocks are clearer and easier to maintain than single-line strings. The LLM receives the full description text — format it for readability, with the primary purpose first and "Use when..." guidance at the end.</p>
</blockquote>

## Wiring it into the ChatClient

Register the tools in the `ChatClient` bean alongside `QuestionAnswerAdvisor` and `MessageChatMemoryAdvisor`:

```java
@Configuration
class AiConfig {

    @Bean
    ChatClient supportClient(
            ChatClient.Builder builder,
            VectorStore vectorStore,
            ChatMemory chatMemory,
            OrderTools orderTools
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
                .defaultTools(orderTools)     // ← tools registered here
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.2)
                        .maxTokens(600)
                        .build())
                .build();
    }
}
```

The controller is unchanged — it still calls `chatClient.prompt().user(...).call().content()`.

## System prompt update for tool use

Update the system prompt to tell the assistant it has access to live order data:

**`src/main/resources/prompts/support-system.st`:**

```
You are a customer support assistant for TechGadgets, an online electronics store.

You have access to live order data and can look up order status, delivery information,
and refund eligibility for any order.

For order-related questions:
- Always look up the order using the available tools before answering
- Provide specific information from the lookup results (status, dates, tracking numbers)
- Do not guess or estimate — use actual data from the tools

For policy and product questions:
- Use only the information provided in the context below
- If the answer is not in the context, say: "I don't have that information."

Always be concise: 2–4 sentences unless more detail is explicitly needed.
```

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Tell the LLM explicitly when to use tools. "Always look up the order before answering" prevents the model from guessing an answer from training data instead of calling the tool. Without this instruction, the model may sometimes answer "orders typically take 5-7 days" instead of actually checking the specific order.</p>
</blockquote>

## Seeing it in action

With the tools registered and the system prompt updated, the conversation flows like this:

```
User: "My order TG-9821 hasn't arrived and it was due yesterday. Am I eligible for a refund?"

[LLM decides to call getOrderStatus("TG-9821")]
→ Result: Order{status=SHIPPED, carrier=FedEx, trackingNumber=TRK-44821, estimatedDelivery=yesterday}

[LLM decides to call checkRefundEligibility("TG-9821")]
→ Result: RefundEligibility{eligible=false, reason="Order is in transit", instructions="Track at FedEx using TRK-44821"}

LLM generates final answer:
"Your order TG-9821 is currently in transit with FedEx (tracking: TRK-44821).
It was estimated for delivery yesterday and appears to be delayed.
At this point, refunds are not available for in-transit orders — please allow 1-2
additional business days. If it hasn't arrived by then, contact us and we'll reassess
your refund eligibility."
```

Two tool calls. One coherent, specific, actionable answer.

## Handling a multi-entity conversation

The agent maintains memory across turns, so follow-up questions work naturally:

```
User: "What about my other order, TG-9804?"

[LLM calls getOrderStatus("TG-9804")]
→ Result: Order{status=DELIVERED, actualDelivery=5 days ago}

[LLM calls checkRefundEligibility("TG-9804")]
→ Result: RefundEligibility{eligible=true, reason="Within 30-day window", amount=89.99}

LLM: "Order TG-9804 was delivered 5 days ago and is within the 30-day return window.
You're eligible for a full refund of $89.99.
Visit support.techgadgets.com/returns and enter your order number to start the process."
```

The assistant checked a different order, called two tools, and produced a complete answer — because it had the memory from earlier turns to understand "other order" refers to TG-9804.

## Integration test

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderAgentTest {

    @Autowired
    TestRestTemplate restTemplate;

    @Test
    void agentFetchesLiveOrderStatus() {
        String conversationId = UUID.randomUUID().toString();

        var request = new SupportRequest(
            "What is the status of order TG-9821?",
            conversationId
        );

        var response = restTemplate.postForObject(
            "/api/support/chat", request, SupportResponse.class
        );

        // The answer should contain live data from the tool, not a generic response
        assertThat(response.answer()).containsIgnoringCase("FedEx");
        assertThat(response.answer()).containsIgnoringCase("TRK-44821");
    }

    @Test
    void agentAssessesRefundEligibility() {
        var request = new SupportRequest(
            "Is order TG-9821 eligible for a refund?",
            UUID.randomUUID().toString()
        );

        var response = restTemplate.postForObject(
            "/api/support/chat", request, SupportResponse.class
        );

        // Shipped orders are not eligible — the agent should say so
        assertThat(response.answer().toLowerCase())
            .satisfiesAnyOf(
                a -> assertThat(a).contains("in transit"),
                a -> assertThat(a).contains("not eligible")
            );
    }
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Agent tests are non-deterministic — the LLM decides how to phrase the answer. Use <code>containsIgnoringCase</code> for facts that must appear, and <code>satisfiesAnyOf</code> for phrases the model might vary. Avoid exact string matching of LLM-generated text.</p>
</blockquote>

## What the complete agent stack looks like

The support assistant now has four capabilities working together:

| Capability | Provided by |
|---|---|
| Knowledge base Q&A | `QuestionAnswerAdvisor` + pgvector |
| Conversation continuity | `MessageChatMemoryAdvisor` + JdbcChatMemory |
| Live order data | `@Tool` methods on `OrderTools` |
| Streaming UI | SSE endpoint + browser `EventSource` |

A user can ask about policies (RAG answers), reference what they said earlier (memory answers), and get live order details (tool call answers) — all within the same conversation, through the same endpoint, with no change to the controller.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post adds product search as an additional tool, showing how RAG and tool calling compose naturally. Then the final Module 6 post steps back to discuss agent design patterns — when tools are better than chains, when to avoid agents entirely, and how to reason about reliability in multi-step AI systems.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/tools.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Tools reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Advisors reference</a>
