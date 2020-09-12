---
layout: post
identifier: Deserialize json with Java parameterized constructor
title: Deserialize json with Java parameterized constructor
status: published
type: post
published: true
comments: true
category: blogs
tags: [jackson, java, json]
date: 2016-09-12T14:17:25-04:00
comments: true
share: true
excerpt: In this blog post we are going to learn how to deserialize json into Java class which doesn't have default constructor.
logo: java/java-32.png
---

In my previous blog [JSON deserialize generic types using Gson and Jackson]({{ site.baseurl }}{% link _posts/blogs/2016-09-07-JSON-deserialize-generic-types-using-Gson-and-Jackson.md %}) 
 I talked about how you can deserialize JSON using Java Generics. Now in this blog post, we are going to learn how 
 to deserialize JSON into a Java class that doesn't have a default constructor. For this blog, I am using the Jackson library.

Almost all frameworks require a default(no-argument) constructor in your class because these frameworks use reflection
  to create objects by invoking the default constructor but if there is no default constructor present in class then 
  its hard to instantiate it using reflection. Let's assume we have a class with a no-args constructor 
  (only a parameterized constructor present) and we want to deserialize it.
  
{% gist jeetmp3/7eff6ff303b58894715878833c381f24 UserProfile.java %}

And a json file 
{% gist jeetmp3/7eff6ff303b58894715878833c381f24 UserProfile.json %}

There are two ways in Jackson to deserialize this type of class.

1. Custom deserializer
2. Mixin Annotations

### 1. Custom Deserializer
In Custom Deserializer you will create a class and extend it with `com.fasterxml.jackson.databind.JsonDeserializer` and override its abstract method `deserialize()`. This class gives you full control, you'll get json in `com.fasterxml.jackson.core.JsonParser`. Now you can map json properties with class properties. In my case, I am creating `UserProfileDeserializer`.
{% gist jeetmp3/7eff6ff303b58894715878833c381f24 UserProfileDeserializer.java %}

Now we need to register above deserializer in `com.fasterxml.jackson.databind.ObjectMapper`. So that, while deserializing the `UserProfile` class it uses `UserProfileDeserializer`.
{% gist jeetmp3/7eff6ff303b58894715878833c381f24 UserProfileDeserializerDemo.java %}

>In above code we are adding our Deserializer in `com.fasterxml.jackson.databind.module.SimpleModule` and that module is registered in `com.fasterxml.jackson.databind.ObjectMapper`. Similarly, you can register deserializers for other classes too.

### 2. Mixin Annotations
Jackson provides another way of doing this by using *__Mixin Annotations__*. You can read about Jackson Mixin <a href="https://github.com/FasterXML/jackson-docs/wiki/JacksonMixInAnnotations" target="_blank">here</a>. In our class `UserProfile` there is no default constructor, it has a parameterized constructor. Let's check out how to create a mixin for our class.
{% gist jeetmp3/7eff6ff303b58894715878833c381f24 UserProfileMixin.java %}

That's it !! 

>We have created a constructor same as in `UserProfile` class and marked it with `com.fasterxml.jackson.annotation.JsonCreator` annotation. This will tell `com.fasterxml.jackson.databind.ObjectMapper` this is how target class (`UserProfile`) constructor looks and constructor parameters are marked with `com.fasterxml.jackson.annotation.JsonProperty` annotation.

Now check out how to register this mixin class in `com.fasterxml.jackson.databind.ObjectMapper`
{% gist jeetmp3/7eff6ff303b58894715878833c381f24 UserProfileMixinDemo.java %}

Enjoy !!!! ☺☺
