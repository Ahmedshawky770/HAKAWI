# Auth Module

## Overview
Handles user authentication and authorization for the Hakawi platform.

## Endpoints
- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login with email and password
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/session` - Get current session
- `POST /api/v1/auth/logout` - Logout and blacklist refresh token
- `GET /api/v1/auth/oauth/:provider` - OAuth login (Google, Facebook, Twitter, GitHub, Apple, TikTok)

## Technologies
- JWT for access tokens
- bcrypt for password hashing
- Valkey for refresh token blacklist
- Passport.js for OAuth strategies

## Security
- Passwords are hashed with bcrypt (10 rounds)
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Refresh tokens are blacklisted on logout
- Rate limiting: 10 requests per minute per IP
