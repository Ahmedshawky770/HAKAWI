CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  google_id VARCHAR(255) UNIQUE,
  facebook_id VARCHAR(255) UNIQUE,
  twitter_id VARCHAR(255) UNIQUE,
  github_id VARCHAR(255) UNIQUE,
  apple_id VARCHAR(255) UNIQUE,
  tiktok_id VARCHAR(255) UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  name VARCHAR(100) NOT NULL,
  avatar TEXT,
  bio TEXT,
  account_type VARCHAR(20) NOT NULL DEFAULT 'reader',
  admin_role VARCHAR(20),
  is_verified BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  access_blocked BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS users_account_type_idx ON users(account_type);
