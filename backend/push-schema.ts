import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'hakawi',
  user: 'postgres',
  password: 'postgres',
});

async function main() {
  try {
    console.log('Connecting to database...');
    const sql = await pool.connect();
    console.log('Connected to database');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        google_id VARCHAR(255),
        facebook_id VARCHAR(255),
        twitter_id VARCHAR(255),
        github_id VARCHAR(255),
        apple_id VARCHAR(255),
        tiktok_id VARCHAR(255),
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
        email_verified BOOLEAN DEFAULT FALSE,
        email_verification_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Users table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        content TEXT NOT NULL,
        excerpt TEXT,
        cover_image TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        author_id UUID NOT NULL REFERENCES users(id),
        category_id UUID,
        published_at TIMESTAMP,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Stories table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        parent_id UUID REFERENCES categories(id),
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Categories table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) NOT NULL UNIQUE,
        slug VARCHAR(50) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Tags table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        story_id UUID NOT NULL REFERENCES stories(id),
        type VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(user_id, story_id)
      );
    `);
    console.log('Reactions table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        story_id UUID NOT NULL REFERENCES stories(id),
        author_id UUID NOT NULL REFERENCES users(id),
        parent_id UUID REFERENCES comments(id),
        content TEXT NOT NULL,
        like_count INTEGER DEFAULT 0 NOT NULL,
        reply_count INTEGER DEFAULT 0 NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Comments table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS comment_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        comment_id UUID NOT NULL REFERENCES comments(id),
        type VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(user_id, comment_id)
      );
    `);
    console.log('Comment reactions table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_id UUID NOT NULL REFERENCES users(id),
        following_id UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(follower_id, following_id)
      );
    `);
    console.log('Follows table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        is_read BOOLEAN DEFAULT FALSE NOT NULL,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Notifications table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
        email_enabled BOOLEAN DEFAULT TRUE NOT NULL,
        push_enabled BOOLEAN DEFAULT TRUE NOT NULL,
        story_reactions BOOLEAN DEFAULT TRUE NOT NULL,
        comments BOOLEAN DEFAULT TRUE NOT NULL,
        follows BOOLEAN DEFAULT TRUE NOT NULL,
        mentions BOOLEAN DEFAULT TRUE NOT NULL,
        system BOOLEAN DEFAULT TRUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Notification preferences table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        participant1_id UUID NOT NULL REFERENCES users(id),
        participant2_id UUID NOT NULL REFERENCES users(id),
        last_message_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(participant1_id, participant2_id)
      );
    `);
    console.log('Conversations table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id),
        sender_id UUID NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE NOT NULL,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Messages table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS uploads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mimetype VARCHAR(100) NOT NULL,
        size INTEGER NOT NULL,
        url TEXT NOT NULL,
        cdn_url TEXT,
        uploaded_by_id UUID REFERENCES users(id),
        story_id UUID REFERENCES stories(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Uploads table created/verified');
    
    await sql.query(`
      CREATE TABLE IF NOT EXISTS moderation_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        reason TEXT,
        moderated_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('Moderation logs table created/verified');
    
    console.log('Schema sync complete');
    sql.release();
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
