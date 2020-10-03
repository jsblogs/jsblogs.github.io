---
layout: post
identifier: Azure Resource Owner Password Credentials flow
title: Azure Resource Owner Password Credentials flow
status: published
type: post
published: true
comments: true
category: azure
tags: [java, azure, azure-ad, ROPC]
date: 2020-09-30T00:00:00-04:00
comments: true
share: true
excerpt: This blog post will demonstrates how to setup Resource Owner Password Credentials flow in Azure.
image: cards/azure-ad-graph-api.jpg
---

* [Introduction](#intro)
* [Setup AppRegistration](#app-registration)
* [Create Test User](#test-user)
* [ROPC Call](#ropc)
* [References](#ref)

## Introduction <a name="intro"></a>
Azure provides ROPC (Resource Owner Password Credentials) flow where the Application exchanges user credentials for accessToken and refresh token. There are few important points to consider when planning to use ROPC flow.
1. This flow doesn't work with federated IDPs like Facebook, GitHub, Microsoft, etc. and works with local accounts only.
2. Invited accounts doesn't work with this flow.
3. It does not work if the MFA (Multi-Factor Authentication) is enabled.

Below are the few steps to Setup ROPC.

## Setup AppRegistration <a name="app-registration">
Just like in other OAuth2 providers we have to register an application, similarly, we'll be creating one app registraion here.
1. Login to [https://portal.azure.com](https://portal.azure.com) 
2. In the search box type __Azure Active Directory__
 ![Search Azure Active Directory](/public/images/blogs/azure/search-aad.png)
3. Find and navigate to __App Registrations__ on the left panel.
 ![App Registrations](/public/images/blogs/azure/app-registrations.png)
4. Click on __+ New Registration__
5. Add application name in the given form and choose the supported account types. In my case I've selected the __Accounts in this organizational directory only__ because I'm   creating the single tenant access only. If you want you app can access multiple tenant then you can choose the other options provided in the form.
 ![App Registrations](/public/images/blogs/azure/registration-form.png)
6. Once the app is created then you'll be redirect to App Overview page. Now here you need to find and navigate to the API Permission on the left panel.
 ![App Registrations](/public/images/blogs/azure/app-overview.png)
7. Grant admin consent for the default directory.
 ![Grant Admin Consent](/public/images/blogs/azure/admin-consent.png)
8. Now click on the Authentication on the left panel and select __Treat application as a public client__ and then hit save.
 ![Authentication](/public/images/blogs/azure/authentication.png)
 
 Congratulations you've configured the AppRegistration and setup the ROPC sucessfully.
 
## Create Test User <a name="test-user"></a>
To test the flow I'll be creating one user as my email id doesn't belongs to the tenant in which I've created the app registration.
1. To create user type __Azure Active Directory__ in the search box and click on the users in the left panel. (Make sure you're on the same tenant in where you've created the App Registration).
 ![Add User](/public/images/blogs/azure/add-user.png)
2. Click __New User__ and then select __Create User__. Once the user is created then open a new tab and try to login into [https://portal.azure.com](https://portal.azure.com) and change the password if you've choosen the Auto generate password option.
![Add User](/public/images/blogs/azure/add-user.png)

## ROPC Call<a name="ropc"></a>
Now it's time to mkae the api call to get the token.
Use below API to get the token

URI https://login.microsoftonline.com/&lt;tenant-id&rt;/oauth2/token
Method - POST
Form urlencoded body
grant_type=password
username=&lt;user&rt;
password=&lt;password&rt;
resource=&lt;clientId&rt;
client_id=&lt;clientId&rt;

Goto App Registartion overview page to get __tenantId__ and __clientId__ details.
![Token](/public/images/blogs/azure/token.png)

## References <a name="ref"></a>
Azure ROPC resources
* [Getting started with Azure AD]({{ site.baseurl }}{% link _posts/spring/2020-04-11-Spring-security-using-OAuth2-with-azure-ad.md %})
* [Custom IDP in Auzre B2C]({{ site.baseurl }}{% link _posts/spring/2020-09-12-Spring-security-using-OAuth2-with-AzureAD-B2C.md %})
* [Configure the resource owner password credentials flow in Azure AD B2C](https://docs.microsoft.com/en-us/azure/active-directory-b2c/configure-ropc?tabs=app-reg-ga)
* [Microsoft identity platform and the OAuth 2.0 client credentials flow](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow)
