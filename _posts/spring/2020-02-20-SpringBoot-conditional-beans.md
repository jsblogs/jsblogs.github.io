---
layout: post
identifier: SpringBoot Conditional Beans
title: SpringBoot Conditional Beans
status: published
type: post
published: false
comments: true
category: spring
tags: [spring, springboot, java, conditional-beans]
date: 2020-02-20T00:00:00-04:00
comments: true
share: true
excerpt: SpringFramework provides a way to create conditional beans, i.e the bean will only be created when the given condition is satisfied.
logo: spring/boot-32.png
---
* [Introduction](#intro)
* [Technologies used](#tech-used)

## Introduction <a name="intro"></a>
SpringFramework provides a way to create conditional/optional beans, i.e the bean/component will only be registered when the given condition is met.  

For example `ConditionalOnMissingBean(<TargetClass>)` will create a bean when no spring bean found for then given **TargetClass**.

There are two ways to register a conditional beans
1. Using SpringBoot provided predefined conditions
2. Create your own condition
In this blog post, we'll explore both the way.

## Technologies used <a name="tech-used"></a>
1. Java 11
2. Spring Boot 2.2.4
3. Gradle 6.0.1


### SpringBoot provided conditions
There are several conditional annotations provided by the spring-boot framework and each one is used for specific condition.

1. __ConditionalOnBean__: Condition satisfies when a bean exists for given class. 
```java
@Bean
@ConditionalOnBean(DataSource.class)
public EntityManager entityManager() {
	// Bean definition
}
``` 
2. __ConditionalOnClass__: Condition satisfies when given class is exists on classpath.
```java
@Bean
@ConditionalOnClass( name = "org.h2database.Driver" )
public EntityManager entityManager() {
	// Bean definition
}
``` 
3. __ConditionalOnExpression__: Accepts SpEL expression and the expression should return `true` to pass the condition.
```java
@Bean
ConditionalOnExpression( value ="" )

```
4. ConditionalOnJava
5. ConditionalOnJndi
6. ConditionalOnMissingBean
7. ConditionalOnMissingClass
8. ConditionalOnNotWebApplication
9. ConditionalOnProperty
10. ConditionalOnResource
11. ConditionalOnSingleCandidate
12. ConditionalOnWebApplication

### 1. ConditionalOnBean
The conditions satisfies when given bean exists in the Context. Which means target bean will only be created if at least a bean exists for given class.

Example:

```java
@Bean
@ConditionalOnBean(DataSource.class)
public EntityManager entityManager() {
	// Bean definition
}
``` 
In above example `EntityManager` bean will created only when `DataSource` bean exists in the context.

> Note: As per Spring documentation, the condition can only match the bean definitions that have been processed by the application context so far and, as such, it is strongly recommended to use this condition on auto-configuration classes only. If a candidate bean may be created by another auto-configuration, make sure that the one using this condition runs after.

### 2. ConditionalOnClass
The bean/component will only