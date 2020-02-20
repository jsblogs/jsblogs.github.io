---
layout: post
title: Custom Auto-Configuration in SpringBoot
status: published
type: post
published: true
comments: true
category: spring
tags: [JAVA, springboot, spring, auto-configuration]
date: 2020-02-18T00:00:00-04:00
comments: true
share: true
excerpt: This blog post will explain how to enable spring boot auto-configuration for your shared library/project.
logo: spring/boot-32.png
---
* [Introduction](#introduction)
* [Technologies used](#tech-used)
* [Project Structure](#structure)
* [Create config classes](#config-classes)

## Introduction <a name="introduction"></a>
The goal of this blog is to understand the autoconfiguration provided by SpringBoot. I'll be creating a logging library for demo purpose and that will include Auto-Configuration class to create all required beans for that library. 

## Technologies used <a name="tech-used"></a>

* Java 11
* Spring Boot 2.2.4
* Gradle 6.0.1

## Project Structure <a name="structure"></a>
![Alt Text](https://dev-to-uploads.s3.amazonaws.com/i/bo4objeiz94xh40vme53.png)

I'm using a Gradle multi-module project. The module `logging-library` will be a shared library that will be used in the `service` module.

## Create config classes <a name="config-classes"></a>
Now It's time to create required config classes. I've created a config class called `LoggingAutoConfiguration` and marked as `@Configuration` and created one [conditional bean](#).

```java
@Configuration
public class LoggingAutoConfiguration {

    // We can define beans here

    @ConditionalOnMissingBean(Logger.class)
    @Bean
    public Logger getLogger() {
        return new ConsoleLogger();
    }
}
```
As of now this class is just a normal spring configuration and to make it auto-configuration class we need to follow 2 steps:

### Step 1: Create *spring.factories* file
Create a file in`logging-library` with name `spring.factories` under `resources\META-INF\` directory.
### Step 2: Register the auto-config class 
Now add your configuration class into the `spring.factories`.
```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=tutorials.logging.LoggingAutoConfiguration
```

That's it!!!

Now we can inject the module in `service` and we don't need to specify any package to scan from `logging-library` our auto-configuration class will take care of that.

![Alt Text](https://dev-to-uploads.s3.amazonaws.com/i/ih7dvtntzv436823selo.png)

You can find the running code [here](https://github.com/jeetmp3/tutorials/tree/master/springboot-auto-config)
