# Spring Boot 4.x blog series TODO

Target audience: junior to mid-level engineers.
Writing format for every post: problem in older version -> what changed in Spring Boot 4.x -> practical benefit -> migration checklist.
Readability format for every post: include `> **Tip:**`, `> **Important:**`, `> **Caution:**`, quick comparison table, and short sections.

- [x] `spring-boot-4-api-versioning-for-safer-rest-upgrades.md`  
  Focus: older custom API versioning logic vs built-in API versioning support in Spring Boot 4.x.
- [x] `spring-boot-4-http-service-clients-simplified.md`  
  Focus: `RestTemplate`/manual client boilerplate vs HTTP Service Clients + Boot configuration.
- [x] `spring-boot-4-opentelemetry-starter-observability.md`  
  Focus: manual telemetry setup vs dedicated OpenTelemetry starter.
- [x] `spring-boot-4-resttestclient-for-http-tests.md`
  Focus: test setup friction in older versions vs `RestTestClient`.
- [x] `spring-boot-4-jmsclient-modern-jms-access.md`
  Focus: verbose JMS template code vs `JmsClient`.
- [x] `spring-boot-4-1-jackson-read-write-properties.md`
  Focus: coarse Jackson tuning in older versions vs new `spring.jackson.read.*` and `spring.jackson.write.*`.
- [x] `spring-boot-4-1-async-context-propagation.md`
  Focus: lost tracing/security context in async flows vs 4.1 improvements.
