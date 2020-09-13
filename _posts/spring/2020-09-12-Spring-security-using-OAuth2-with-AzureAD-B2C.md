---
layout: post
identifier: Spring security using OAuth2 with Microsoft AzureAD B2C
title: Spring security using OAuth2 with Microsoft AzureAD B2C
status: published
type: post
published: true
comments: true
category: spring
tags: [java, springboot, spring-security, oauth2, azure-b2c]
date: 2020-09-12T00:00:00-04:00
comments: true
share: true
excerpt: This blog post will explain how to configure AzureAD B2C tenant and integrate the same with Spring-Security OAuth2. 
image: cards/security-azure-ad-b2c.jpg
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

* [Introduction](#intro)
* [Video Tutorial](#tutorial)

## Introduction <a name="intro"></a>
Microsoft Azure provides capability to integrate social-logins in the application by using AzureAD B2C. 
 The good thing about that is you'll have single Authorization server (Azure) and different IDP like Google, Facebook, GitHub or any custom IDP.

To achieve this we need to create 1 B2C tenant and configure __App Registration__, __IDP__, and create __UserFlow__. The below video tutorial covers all these 
steps and guide you how to integrate Azure B2C with spring security.  


## Video Tutorial <a name="tutorial"></a>
<div class="videoWrapper">
    <iframe width="560" height="315" src="https://www.youtube.com/embed/z6ZbYZQyaco" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>
