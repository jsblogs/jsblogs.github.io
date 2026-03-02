---
title: Function calling in Spring AI — let the LLM use your Java methods
description: Spring AI's @Tool annotation turns ordinary Java methods into tools the LLM can invoke. This post covers the full API — annotating methods, registering tools with ChatClient, controlling execution, and reading tool call results.
pubDatetime: "2026-03-03T15:00:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev annotated one Java method. Added it to the `ChatClient` call. Asked the assistant a question that required live data. The LLM called the method, received the result, and wove it into a coherent answer.

It felt like magic. It isn't — it is a well-defined protocol. This post explains every step.

## Table of contents

## The @Tool annotation

Mark any method with `@Tool` to make it available to the LLM:

```java
class WeatherTools {

    @Tool(description = "Get the current weather for a city.")
    String getCurrentWeather(String city) {
        // In a real application, call a weather API here
        return "Sunny, 22°C in " + city;
    }
}
```

The `description` attribute is sent to the LLM as the tool's documentation. The LLM uses it to decide whether to call this tool for a given user message.

The method signature becomes the tool's input schema. `String city` tells the LLM it must provide a `city` argument as a string.

## Registering tools with ChatClient

Pass tool instances at call time using `.tools()`:

```java
WeatherTools weatherTools = new WeatherTools();

String answer = chatClient.prompt()
        .user("What is the weather in London?")
        .tools(weatherTools)        // register the tool for this call
        .call()
        .content();

System.out.println(answer);
// → "The current weather in London is sunny with a temperature of 22°C."
```

Under the hood, Spring AI:
1. Introspects `WeatherTools` for `@Tool`-annotated methods
2. Sends the method signature and description to the LLM as a tool definition
3. When the LLM returns a tool call (e.g., `getCurrentWeather("London")`), Spring AI invokes the Java method
4. The result ("Sunny, 22°C in London") is sent back to the LLM
5. The LLM generates a natural-language answer using that result

## Tool parameter types

Spring AI serialises tool parameters and return values as JSON. Use plain Java types that Jackson can handle:

```java
class ProductTools {

    @Tool(description = "Look up a product by its SKU and return current price and stock status.")
    ProductInfo getProduct(String sku) {
        // returns a record that Jackson serialises to JSON
        return productRepository.findBySku(sku)
                .map(p -> new ProductInfo(p.getName(), p.getPrice(), p.getStockCount()))
                .orElse(null);
    }

    @Tool(description = "Search for products by name or category. Returns a list of matching products.")
    List<ProductInfo> searchProducts(String query, String category) {
        return productRepository.search(query, category).stream()
                .map(p -> new ProductInfo(p.getName(), p.getPrice(), p.getStockCount()))
                .limit(5)
                .toList();
    }

    record ProductInfo(String name, double price, int stockCount) {}
}
```

Support types:
- Primitive types and their wrappers (`String`, `int`, `double`, `boolean`)
- Java records and POJOs (serialised as JSON objects)
- Lists (`List<T>` where T is serialisable)
- Enums (serialised as their name)
- `null` (for optional returns when no data is found)

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Java records are ideal as tool return types — they map cleanly to JSON and communicate the schema clearly to the LLM. Avoid returning complex nested hierarchies; the LLM handles flat or shallow structures more reliably than deeply nested ones.</p>
</blockquote>

## Adding parameter descriptions

For multi-parameter tools, add descriptions to individual parameters so the LLM knows what each one means:

```java
@Tool(description = "Search orders for a customer. Returns order history.")
List<OrderSummary> searchOrders(
        @ToolParam(description = "The customer's email address") String email,
        @ToolParam(description = "Filter by status: PENDING, SHIPPED, DELIVERED, CANCELLED. Leave null for all.") String status,
        @ToolParam(description = "Maximum number of orders to return. Default is 10.") int limit
) {
    return orderRepository.findByEmail(email, status, limit);
}
```

`@ToolParam(description = "...")` attaches documentation to each parameter. The LLM uses these to know how to construct valid arguments.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Always describe nullable or optional parameters explicitly. If a parameter can be null (for "all statuses"), say so in the description. The LLM defaults to providing a value unless told otherwise, which causes errors when your code doesn't expect a value.</p>
</blockquote>

## Registering tools globally vs per call

**Per-call (`.tools()`)** — tool is available only for that specific call:

```java
String answer = chatClient.prompt()
        .user(question)
        .tools(new OrderTools(orderService))
        .call()
        .content();
```

**Global (builder)** — tool is available for every call through this `ChatClient`:

```java
@Bean
ChatClient supportClient(ChatClient.Builder builder, OrderTools orderTools) {
    return builder
            .defaultSystem("You are a support assistant.")
            .defaultTools(orderTools)       // registered for every call
            .build();
}
```

Use global registration for tools that are always relevant (order status, product lookup). Use per-call registration for tools that apply only to specific request types.

## Inspecting tool calls — what actually happens

Enable `SimpleLoggerAdvisor` and set log level to DEBUG to see the tool call traffic:

```
→ LLM CALL: user="What is the status of order TG-9821?"
← LLM RESPONSE: tool_call=getOrderStatus(orderId="TG-9821")
→ TOOL RESULT: {"orderId":"TG-9821","status":"SHIPPED","estimatedDelivery":"2026-03-05","carrier":"FedEx","trackingNumber":"TRK-44821"}
← LLM RESPONSE: "Your order TG-9821 has shipped via FedEx and is estimated to arrive on March 5th. You can track it with tracking number TRK-44821."
```

The conversation has three exchanges (user → tool call → tool result → answer) but the controller only sees one. The agent loop is internal.

## Returning errors from tools

When a tool call fails, return a meaningful error string rather than throwing an exception. The LLM will incorporate the error into its response:

```java
@Tool(description = "Get order status by order ID.")
String getOrderStatus(String orderId) {
    try {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        return "Status: " + order.getStatus() + ", Delivery: " + order.getEstimatedDelivery();
    } catch (OrderNotFoundException e) {
        return "Order " + orderId + " not found. Please verify the order number.";
    } catch (Exception e) {
        log.error("Failed to fetch order {}", orderId, e);
        return "Unable to retrieve order status at this time. Please try again.";
    }
}
```

When the LLM receives "Order TG-9821 not found", it will tell the user the order was not found and ask them to verify the number — a better user experience than an unhandled exception.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Do not return raw exception messages or stack traces from tools — they often contain internal details you don't want exposed. Always catch exceptions in tool methods and return user-friendly error descriptions.</p>
</blockquote>

## Multiple tools in one class

Organise related tools in a single class. The LLM receives all of them when the class is registered:

```java
@Component
class SupportTools {

    private final OrderService orderService;
    private final ProductService productService;

    SupportTools(OrderService orderService, ProductService productService) {
        this.orderService = orderService;
        this.productService = productService;
    }

    @Tool(description = "Get the current status and tracking information for an order.")
    OrderStatus getOrderStatus(String orderId) {
        return orderService.getStatus(orderId);
    }

    @Tool(description = "Get product details including specifications, price, and stock availability.")
    ProductDetails getProductDetails(String productId) {
        return productService.getDetails(productId);
    }

    @Tool(description = "Check if a customer's order qualifies for a return or refund based on order date and status.")
    RefundEligibility checkRefundEligibility(String orderId) {
        return orderService.checkRefundEligibility(orderId);
    }
}
```

Register the whole class:

```java
chatClient.prompt()
        .user(question)
        .tools(supportTools)    // all three tools available
        .call()
        .content();
```

## Controlling whether tools can be called multiple times

By default, the LLM can call the same tool multiple times in one request (useful for checking multiple orders). If you need to limit this — for rate limiting or cost control — track calls within the request:

```java
class RateLimitedTools {

    private final AtomicInteger callCount = new AtomicInteger(0);
    private static final int MAX_CALLS = 3;

    @Tool(description = "Get order status.")
    String getOrderStatus(String orderId) {
        if (callCount.incrementAndGet() > MAX_CALLS) {
            return "Tool call limit reached. Please provide one order number at a time.";
        }
        return orderService.getStatus(orderId).toString();
    }
}
```

Since tool instances are created per request in the `.tools()` call, the `callCount` resets on each new request.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post builds a complete order status agent using these APIs — a support assistant that can check live order data, verify delivery estimates, and assess refund eligibility in a single conversation turn. The code in that post ties together everything covered here.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/tools.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Tools reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/tools.html#_tool_annotations" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI @Tool annotation reference</a>
