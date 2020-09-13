---
layout: post
identifier: Spring security using OAuth2 with AngularJs [JWT]
title: Spring security using OAuth2 with AngularJs [JWT]
status: published
type: post
published: true
comments: true
category: spring
tags: [java, springboot, spring-security, oauth2, angular-js, jwt]
date: 2020-08-23T00:00:00-04:00
comments: true
share: true
excerpt: This tutorial is an addition over my spring-security with angular JS video tutorial and will be focusing on the JWT token part.
logo: spring/spring-security-logo.png
---

* [Introduction](#intro)
* [Technologies used](#tech-used)
* [Sequence Diagram of OAuth2 Flow](#diagram)
* [The JwtTokenStore](#token-store)

## Introduction <a name="intro"></a>
This blog post will demonstrate the spring-security & angular JS integration using JWT token. My previous blog explains how we can configure classes to integrate 
 spring security with angular. I recommend you to watch my video tutorial on [Spring Security Using OAuth2 with Angular JS]({{ site.baseurl }}{% link _posts/spring/2020-06-27-Spring-security-using-OAuth2-with-angular-js.md %})
 because this tutorial is an addition over that video.
 
In that video tutorial I created `TokenStore` class to store the token which I'll re-write in this blog to generate JWT tokens.
 
## Technologies used <a name="tech-used"></a>
* Java
* Spring Boot
* Spring Security
* Angular JS 8

## Sequence Diagram of OAuth2 Flow<a name="diagram"></a>

![OAuth2Flow](/public/images/spring/OAuthFlow.png){:class="img-responsive"}

## The JwtTokenStore<a name="token-store"></a>
In that video tutorial I've created HashMap based token store. Now we're going to overwrite that class and will
 create one JWT based implementation.

```java
package com.demo.security.config;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWT;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.stereotype.Component;

import java.security.interfaces.ECPrivateKey;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalUnit;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class JwtTokenStore implements ITokenStore {
    // 1
    private final String tokenSignKey = "c5d4d70419bd4909a1e502812c6e1f2b";

    // 2
    private final String REG_ID = "clientRegistrationId";
    private final String NAMED_KEY = "namedAttributeKey";
    private final String AUTHORITIES = "authorities";
    private final String ATTRIBUTES = "attributes";

    // 3
    public String generateToken( Authentication authentication ) throws Exception {

        OAuth2AuthenticationToken token = ( OAuth2AuthenticationToken ) authentication;
        DefaultOAuth2User userDetails = ( DefaultOAuth2User ) token.getPrincipal();
    
        // 4
        List<String> auths = userDetails.getAuthorities()
                .stream()
                .map( GrantedAuthority::getAuthority )
                .collect( Collectors.toList());
        // 5
        JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
                .subject(  userDetails.getAttribute("id").toString())
                .expirationTime( getDate( 5, ChronoUnit.HOURS ) )
                .claim( NAMED_KEY, "name" )
                .claim( ATTRIBUTES, userDetails.getAttributes() )
                .claim( AUTHORITIES, auths )
                .claim( REG_ID, token.getAuthorizedClientRegistrationId() )
                .build();

        // 6
        ECKey key = new ECKeyGenerator( Curve.P_256 ).keyID( tokenSignKey ).generate();
        JWSHeader h = new JWSHeader.Builder( JWSAlgorithm.ES256 )
                .type( JOSEObjectType.JWT )
                .keyID( key.getKeyID() )
                .build();
        SignedJWT jwt = new SignedJWT( h, claimsSet );
        // 7
        jwt.sign( new ECDSASigner( ( ECPrivateKey ) key.toPrivateKey() ) );
        return jwt.serialize();
    }

    // 8
    public Authentication getAuth( String jwt ) throws Exception {
        SignedJWT signedJWT = SignedJWT.parse( jwt );
        // 9
        validateJwt( signedJWT );

        JWTClaimsSet claimsSet = signedJWT.getJWTClaimsSet();
        
        // 10
        String clientRegistrationId = (String ) claimsSet.getClaim( REG_ID );
        String namedAttributeKey = (String) claimsSet.getClaim( NAMED_KEY );
        Map<String, Object> attributes = (Map<String, Object>)claimsSet.getClaim( ATTRIBUTES );
        Collection<? extends GrantedAuthority > authorities =( (List<String> ) claimsSet.getClaim( AUTHORITIES ))
                .stream().map( SimpleGrantedAuthority::new ).collect( Collectors.toSet());

        // 11
        return new OAuth2AuthenticationToken(
                new DefaultOAuth2User( authorities, attributes, namedAttributeKey ),
                authorities,
                clientRegistrationId
        );
    }

    private static Date getDate( long amount, TemporalUnit unit ) {
        return Date.from(
                LocalDateTime.now()
                .plus( amount, unit )
                .atZone( ZoneId.systemDefault() )
                .toInstant()
        );
    }

    private void validateJwt( JWT jwt ) throws Exception {
        // 12
        if(jwt.getJWTClaimsSet().getExpirationTime().before( new Date() )){
            throw new RuntimeException("Token Expired!!");
        }

        // Add validation logic here..
    }
}
```

In the above code base I have added comment numbers which I am going to explain here.
1. Token sign key will be used to sign the JWT. You can use your own key.
2. Attributes which I'm going to get from Authentication object and will put them in the JWT which I'll be using later on to construct the Authentication Object.
3. The generateToken method will accept Authentication object and build JWT token from that.
4. Collecting all the authorities name.
5. Preparing JWT claims with values like Subject, Authorities, Attributes, NamedAttributeKey (required by DefaultOAuth2User), and token expire time
6. Prepare Sign key to Sign the JWT token.
7. Sign the token and return.
8. The getAuth method takes JWT token and prepares the Authentication object from the valid token.
9. Validating the JWT token currently I'm validating the expireTime only, but you can add your custom validation logic.
10. Get required objects from JWT claims which will be used to prepare Authentication token.
11. Prepare and return the valid `OAuth2AuthenticationToken`.
12. Validating the expirationTime with current time.

The running code can be found [here](https://github.com/jeetmp3/tutorials/tree/security-jwt/spring-security-angular). 
