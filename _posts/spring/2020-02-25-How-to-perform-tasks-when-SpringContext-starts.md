---
layout: post
title: How to perform tasks when SpringContext starts
status: published
type: post
published: true
comments: true
category: spring
tags: [spring, context-started, java, springboot]
date: 2020-02-25T00:00:00-04:00
comments: true
share: true
excerpt: SpringFramework provides a way to perform some tasks at the time of application/context started.
logo: spring/boot-32.png
---
* [Introduction](#intro)
* [Technologies used](#tech-used)
* [Application Events](#app-events)
* [ApplicationRunner](#app-runner)

## Introduction <a name="intro"></a>
Have you ever encountered a situation where you've to perform some tasks immediately after the Spring/SpringBoot application starts.  i.e. 
Initialize some data into database, initialize application level constants, make an API call, etc. 

There are several ways to achieve it. Here I'm gonna discuss about:
1. Application events
2. ApplicationRunner

## Technologies used <a name="tech-used"></a>
1. Java 11
2. Spring Boot 2.2.4
3. Gradle 6.0.1

### Application events <a name="app-events"></a>
The Spring framework triggers various events. For our use case we'll be more interested in `ContextStartedEvent` and `ContextRefreshedEvent`.
__ContextStartedEvent__ event triggered at the time of context gets started.
__ContextRefreshedEvent__ event triggered at the time of context gets started or refreshed.

```java
@Component
public class EventHandler {
    @EventListener(ContextStartedEvent.class)
    public void handleContextStartEvent(ContextStartedEvent e) {
        // Write your code here
    }

    @EventListener(ContextRefreshedEvent.class)
    public void handleContextRefreshEvent(ContextRefreshedEvent e) {
        // Write your code here
    }
    // Or you can handle both the events in 1 method  
    
    @EventListener({ContextStartedEvent.class, ContextRefreshedEvent.class})
    public void handleBoth(ApplicationContextEvent e) {
        if (e instanceof ContextStartedEvent) {

        } else {

        }
    }
}
```

### ApplicationRunner <a name="app-runner"></a>
SpringBoot provides an interface called `ApplicationRunner`, any bean implementing this interface should run when that contained in the `SpringApplication`.

```java
@Component
public class DBInitializer implements ApplicationRunner {
    
    private final UserRepository userRepository;
    
    private DBInitializer(UserRepository userRepository) {
        this.userRepository = userRepository;
    }
    
    @Override
    public void run(ApplicationArguments args) throws Exception {
        // Initialize user here
    }
}
``` 

or the above can be used

```java
@Configuration
public class Config {
    
@Bean
    public ApplicationRunner initializeUser(UserRepository userRepository) {
        return args -> {
            // Initialize user here
        };
    }
}
```
ApplicationRunner provides `ApplicationArguments` in the run method which is used to get command line arguments by invoking `getSourceArgs()`.
You can also get the parsed arguments using this class. i.e.

Let's say you've passed command line arguments like
`--source /usr/local --print-only --target /tmp/local`

So the method call to 
1. `getOptionNames()` in `ApplicationArguments` will return set of arguments - ['source', 'print-only', 'target']
2. `containsOption(String name)` checks if argument contains 
3. `getOptionValues(name)` returns list of option values. `getOptionValues('source')` will return list - ['/usr/local']

