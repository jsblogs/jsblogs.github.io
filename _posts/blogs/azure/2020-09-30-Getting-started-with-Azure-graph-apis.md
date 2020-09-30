---
layout: post
identifier: Getting Started with Azure Graph APIs
title: Getting Started with Azure Graph APIs
status: published
type: post
published: true
comments: true
category: azure
tags: [java, azure, azure-ad, graph-api]
date: 2020-09-30T00:00:00-04:00
comments: true
share: true
excerpt: This blog post will demonstrates how to setup AzureAD to use Graph APIs.
image: cards/azure-ad-graph-api.jpg
---

* [Introduction](#intro)
* [Setup AppRegistration](#app-registration)
* [Video Tutorial](#tutorial)

## Introduction <a name="intro"></a>
In my old blogs I talked about how to configure [AzureAD]({{ site.baseurl }}{% link _posts/spring/2020-04-11-Spring-security-using-OAuth2-with-azure-ad.md %}) and [AzureAD B2C]({{ site.baseurl }}{% link _posts/spring/2020-09-12-Spring-security-using-OAuth2-with-AzureAD-B2C.md %}). This blog will cover how to get token from azure oauth API and start using the Graph APIs.

Below are the few steps to configure AppRegistration.

## Setup AppRegistration <a name="app-registration">
Just like in other OAuth2 providers we have to register an application, similarly, we'll be creating one app registraion here.
1. Login to [https://portal.azure.com](https://portal.azure.com) 
2. In the search box type __Azure Active Directory__
 ![Search Azure Active Directory](/public/images/blogs/azure/search-aad.png)
3. Find and navigate to __App Registrations__ on the left panel.
 ![App Registrations](/public/images/blogs/azure/app-registrations.png)
4. Click on __+ New Registration__
5. Add application name in the given form and choose the supported account types. In my case I've selected the __Accounts in this organizational directory only__ because I'm   creating the single tenant access only. If you want you app can access multiple tenant then you can choose the other options provided on the form.
 ![App Registrations](/public/images/blogs/azure/registration-form.png)
6. Once the app is created then you'll be redirect to App Overview page. Now here you need to find and navigate to the API Permission on the left panel.
 ![App Registrations](/public/images/blogs/azure/app-overview.png)
7. 
