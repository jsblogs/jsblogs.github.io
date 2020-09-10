---
layout: post
identifier: Spring security with JWT based login [Without OAuth]
title: Spring security with JWT based login [Without OAuth]
status: published
type: post
published: true
comments: true
category: spring
tags: [springboot, spring-security, jwt, java]
date: 2020-08-28T00:00:00-04:00
comments: true
share: true
excerpt: This video tutorial demonstrates JWT based login using spring-security. 
logo: spring/spring-security-logo.png
---
<style>
.videoWrapper {
    position: relative;
    padding-bottom: 56.25%; /* 16:9 */
    padding-top: 25px;
    height: 0;
}
.videoWrapper iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}
</style>
<img src="/public/images/spring/OAuthFlow.png" height="1" width="0">
* [Introduction](#intro)
* [Video Tutorial](#video-link)
* [Source Code](#source-code)

## Introduction <a name="intro"></a>
This blog post will demonstrate the spring-security with JWT token based login without using OAuth. In some use-cases where you require stateless/token based login
 but doesn't want to go with OAuth for any reason, the JWT based login is useful.
 
## Video Tutorial<a name="video-link"></a>

<div class="videoWrapper">
    <iframe width="560" height="315" src="https://www.youtube.com/embed/-h9jdXfP9Zc" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

## Source Code<a name="source-code"></a>

The source code for tutorial can be found [here](https://github.com/jeetmp3/tutorials/tree/master/spring-security-jwt-login). 
