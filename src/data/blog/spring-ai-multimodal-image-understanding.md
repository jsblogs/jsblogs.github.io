---
title: Multimodal AI in Spring AI — adding image understanding to your Java app
description: Multimodal models process images alongside text. A customer can send a photo of a damaged product, and the LLM reads both image and question together to answer. Spring AI's UserMessage API handles images via URL or base64 — this post shows both.
pubDatetime: "2026-03-03T18:40:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

A customer opened the TechGadgets support chat and typed: "My headphones arrived damaged. Here's a photo." They attached an image. The support assistant, without multimodal capability, had no idea an image was there. It replied: "I'm sorry to hear about your experience. Could you describe the damage?"

A multimodal model reads the image directly. It can see the cracked housing, the bent charging port, the scuffed surface — and respond specifically to what it sees.

## Table of contents

## What multimodal means for developers

A **multimodal model** accepts multiple input types in a single request — typically text and images, though some models also accept audio and video.

From the developer's perspective, it means you can include an image in the user message alongside (or instead of) text. The model processes both together and generates a text response that takes the image into account.

Spring AI supports multimodal input through the `UserMessage` API. Models that support it include:
- OpenAI: `gpt-4o`, `gpt-4o-mini`
- Anthropic: `claude-3-5-sonnet`, `claude-3-haiku`
- Google: `gemini-1.5-pro`
- Ollama: `llava:13b`, `moondream`

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Not all models support images. If you send an image to a text-only model, the API returns an error. Verify multimodal support in your provider's documentation before enabling image uploads in your application.</p>
</blockquote>

## Sending an image via URL

The simplest approach: pass a publicly accessible image URL. The model downloads the image at inference time:

```java
String imageUrl = "https://example.com/uploads/damaged-headphones.jpg";

UserMessage userMessage = new UserMessage(
    "What damage is visible in this product image? Is it covered under the manufacturer's warranty?",
    List.of(new Media(MimeTypeUtils.IMAGE_JPEG, new URL(imageUrl)))
);

String analysis = chatClient.prompt()
        .messages(userMessage)
        .call()
        .content();
```

`Media` carries the MIME type and the content reference. For URLs, pass a `java.net.URL`. Spring AI serialises it as a URL reference in the API request.

## Sending an image via base64 (file upload)

For user-uploaded files that are not publicly accessible, encode the image as base64:

```java
@PostMapping(value = "/chat/with-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
SupportResponse chatWithImage(
        @RequestParam String question,
        @RequestParam String conversationId,
        @RequestPart MultipartFile image
) throws IOException {

    byte[] imageBytes = image.getBytes();
    String base64Image = Base64.getEncoder().encodeToString(imageBytes);
    MimeType mimeType = MimeTypeUtils.parseMimeType(
        image.getContentType() != null ? image.getContentType() : "image/jpeg"
    );

    UserMessage userMessage = new UserMessage(
        question,
        List.of(new Media(mimeType, base64Image))
    );

    String answer = chatClient.prompt()
            .messages(userMessage)
            .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId))
            .call()
            .content();

    return new SupportResponse(answer);
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Base64-encoding a 2MB image produces ~2.7MB of text that is included in the API request body — and counts toward your token budget. Images are billed differently by each provider (OpenAI charges by image tile count based on resolution). Large images are expensive. Resize and compress images before encoding: 512×512 pixels is sufficient for most content analysis tasks.</p>
</blockquote>

## Image compression before sending

Always compress images before sending them to the model:

```java
@Component
class ImageProcessor {

    byte[] resizeAndCompress(byte[] originalBytes, String contentType) throws IOException {
        BufferedImage original = ImageIO.read(new ByteArrayInputStream(originalBytes));

        // Target: 512px longest side (sufficient for most vision tasks)
        int maxDimension = 512;
        int width  = original.getWidth();
        int height = original.getHeight();

        if (width > maxDimension || height > maxDimension) {
            double scale = Math.min((double) maxDimension / width,
                                    (double) maxDimension / height);
            width  = (int) (width  * scale);
            height = (int) (height * scale);
        }

        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = resized.createGraphics();
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                             RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g2d.drawImage(original, 0, 0, width, height, null);
        g2d.dispose();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(resized, "jpeg", out);   // always compress to JPEG
        return out.toByteArray();
    }
}
```

Use it in the controller before encoding:

```java
byte[] compressedBytes = imageProcessor.resizeAndCompress(image.getBytes(), image.getContentType());
String base64Image = Base64.getEncoder().encodeToString(compressedBytes);
```

## Combining image input with RAG

Image analysis and RAG compose naturally. The model reads the image, and the RAG advisor injects policy context from the knowledge base — so the answer is grounded in both visual analysis and your actual policies:

```java
@PostMapping(value = "/chat/with-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
SupportResponse chatWithImage(
        @RequestParam String question,
        @RequestParam String conversationId,
        @RequestPart MultipartFile image
) throws IOException {

    byte[] compressed = imageProcessor.resizeAndCompress(image.getBytes(), image.getContentType());
    String base64 = Base64.getEncoder().encodeToString(compressed);

    UserMessage userMessage = new UserMessage(
        question,
        List.of(new Media(MimeTypeUtils.IMAGE_JPEG, base64))
    );

    // chatClient has QuestionAnswerAdvisor wired — RAG runs automatically
    String answer = chatClient.prompt()
            .messages(userMessage)
            .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId))
            .call()
            .content();

    return new SupportResponse(answer);
}
```

For "Is this damage covered under warranty?", the model sees the image AND the retrieved warranty policy chunk — and answers with the specific clause that applies to the damage it can see.

## The system prompt for image-aware responses

Update the system prompt to guide image-related responses:

```
You are a customer support assistant for TechGadgets.

When a customer provides an image:
- Describe what you can see in the image as it relates to their question
- Do not speculate about what might be off-screen
- If damage is visible, describe it specifically (location, type, severity)
- Apply the warranty and return policies from the context to what you observe

If you cannot determine from the image alone (e.g., functional issues that are not visible),
ask the customer to describe the specific problem.
```

## Practical example: warranty damage assessment

A customer uploads a photo of headphones with a cracked headband and asks "is this covered under warranty?"

With multimodal + RAG:

```
[Image shows: ProX Wireless Headphones with cracked headband at the left ear cup joint]
[RAG context: "Warranty covers defects in materials and workmanship. Physical damage from
drops, impacts, or misuse is not covered under the standard warranty."]

LLM response:
"I can see a crack at the left ear cup joint of your ProX headphones.
This type of structural crack can occur from physical impact or flexing stress.

Under TechGadgets' warranty policy, defects in materials and workmanship are covered,
but damage from physical impact typically is not. Based on the visible crack, this
would likely fall under physical damage.

To confirm coverage, please contact our warranty team at support@techgadgets.com with
this photo and your order number — a specialist can make a final determination."
```

Specific, grounded, and appropriately cautious. A text-only assistant could only give a generic policy summary.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Multimodal input works best for visual evidence tasks: damage assessment, product identification from photos, label/receipt reading. It works poorly for general questions where no visual information adds value. Gate image uploads behind a specific UI flow (e.g., "Attach a photo of the issue") rather than accepting images on all requests.</p>
</blockquote>

## Input validation for image uploads

Add validation before processing:

```java
private void validateImageUpload(MultipartFile image) {
    if (image.isEmpty()) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No image provided");
    }

    long maxSizeBytes = 10 * 1024 * 1024;   // 10 MB
    if (image.getSize() > maxSizeBytes) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Image too large. Maximum size is 10 MB.");
    }

    String contentType = image.getContentType();
    if (contentType == null || !contentType.startsWith("image/")) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Only image files are accepted (JPEG, PNG, WebP).");
    }

    List<String> supported = List.of("image/jpeg", "image/png", "image/webp", "image/gif");
    if (!supported.contains(contentType)) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "Unsupported image type. Please upload a JPEG, PNG, or WebP image.");
    }
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Image uploads are an attack surface. Users may upload non-image files with image MIME types, very large images, or images containing embedded malicious content. Always validate content type, enforce size limits, and process images in an isolated context. Use an image library to re-encode images rather than passing raw bytes directly to the API.</p>
</blockquote>

## Multimodal with local Ollama models

For on-premise deployments, Ollama supports several vision models:

```bash
ollama pull llava:13b        # LLaVA — strong general vision
ollama pull moondream:1.8b   # lightweight, fast
ollama pull llava-phi3:3.8b  # good balance of speed and quality
```

```yaml
# application-local.yml with vision model
spring:
  ai:
    ollama:
      chat:
        options:
          model: llava:13b
```

The Spring AI API is identical — `Media` objects work the same way regardless of whether Ollama or OpenAI is the backend. Vision quality from local models (especially smaller ones) is noticeably lower than frontier models for complex damage assessment, but adequate for simpler tasks like label reading.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post compares Spring AI with LangChain4j — the other major Java AI framework. If you have seen LangChain4j examples elsewhere and wondered how it compares, that post maps the conceptual equivalents between the two frameworks and helps you decide which to use for a new project.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/multimodality.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Multimodality reference</a>
- <a href="https://platform.openai.com/docs/guides/vision" target="_blank" rel="noopener" referrerpolicy="origin">OpenAI Vision guide</a>
- <a href="https://ollama.com/blog/vision-models" target="_blank" rel="noopener" referrerpolicy="origin">Ollama vision models</a>
