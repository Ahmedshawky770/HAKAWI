# Seed Data Strategy
## Hakawi Data Architecture

This document defines the seed data strategy for development, testing, and demo environments in the Hakawi system.

---

## Seed Data Categories

### 1. Reference Data
Static data that rarely changes:
- Account types
- Admin roles
- Permission sets
- Notification types
- Contest statuses
- Rental durations

### 2. Demo Data
Sample data for development and demos:
- Demo users
- Sample stories
- Example books
- Test contests
- Sample notifications

### 3. Test Data
Data for automated testing:
- Test users
- Test stories
- Test transactions
- Edge case scenarios

---

## Reference Data Seeds

### Account Types
```sql
INSERT INTO account_types (id, name, name_ar, description) VALUES
('reader', 'Reader', 'قارئ', 'Default account for consuming content'),
('writer', 'Writer', 'كاتب', 'Can publish stories and texties'),
('rising_star', 'Rising Star', 'نجم صاعد', 'Emerging author with limited features'),
('professional', 'Professional', 'كاتب محترف', 'Full author features, book sales'),
('publisher', 'Publisher', 'ناشر', 'Can create and manage contests'),
('admin', 'Admin', 'مدير', 'Platform administration');
```

### Admin Roles
```sql
INSERT INTO admin_roles (id, name, description) VALUES
('super_admin', 'Super Admin', 'Full system access'),
('content_moderator', 'Content Moderator', 'Can moderate content'),
('financial_officer', 'Financial Officer', 'Can manage financial operations'),
('verification_officer', 'Verification Officer', 'Can verify user accounts');
```

### Permissions
```sql
INSERT INTO permissions (id, name, description, resource, action) VALUES
('content:read', 'Read Content', 'Can read published content', 'content', 'read'),
('content:create', 'Create Content', 'Can create new content', 'content', 'create'),
('content:edit:own', 'Edit Own Content', 'Can edit own content', 'content', 'edit_own'),
('content:delete:own', 'Delete Own Content', 'Can delete own content', 'content', 'delete_own'),
('content:edit:all', 'Edit All Content', 'Can edit any content', 'content', 'edit_all'),
('content:delete:all', 'Delete All Content', 'Can delete any content', 'content', 'delete_all'),
('users:manage', 'Manage Users', 'Can manage user accounts', 'users', 'manage'),
('settings:manage', 'Manage Settings', 'Can manage system settings', 'settings', 'manage'),
('contests:manage', 'Manage Contests', 'Can manage contests', 'contests', 'manage'),
('moderate:content', 'Moderate Content', 'Can moderate content', 'moderation', 'content');
```

### Notification Types
```sql
INSERT INTO notification_types (id, name, description, category) VALUES
('reaction', 'Reaction', 'Someone reacted to your story', 'social'),
('comment', 'Comment', 'Someone commented on your story', 'social'),
('follow', 'Follow', 'Someone followed you', 'social'),
('mention', 'Mention', 'Someone mentioned you', 'social'),
('message', 'Message', 'New direct message', 'communication'),
('story_publish', 'Story Published', 'Someone you follow published a story', 'content'),
('verification', 'Verification', 'Account verification status changed', 'account'),
('system', 'System', 'Platform announcement', 'system'),
('upgrade', 'Upgrade', 'Account type upgraded', 'account'),
('report', 'Report', 'Content you reported was actioned', 'moderation'),
('announcement', 'Announcement', 'Platform-wide announcement', 'system'),
('contest_winner', 'Contest Winner', 'You won a contest', 'contest'),
('contest_new', 'New Contest', 'New contest in followed category', 'contest');
```

---

## Demo Data Seeds

### Demo Users
```sql
INSERT INTO users (id, email, username, name, account_type, is_verified) VALUES
('usr_001', 'reader@demo.hakawi.com', 'reader_demo', 'Demo Reader', 'reader', true),
('usr_002', 'writer@demo.hakawi.com', 'writer_demo', 'Demo Writer', 'writer', true),
('usr_003', 'publisher@demo.hakawi.com', 'publisher_demo', 'Demo Publisher', 'publisher', true),
('usr_004', 'admin@demo.hakawi.com', 'admin_demo', 'Demo Admin', 'admin', true);
```

### Demo Stories
```sql
INSERT INTO stories (id, author_id, title, slug, status, category, views) VALUES
('story_001', 'usr_002', 'The Beginning', 'the-beginning', 'published', 'fiction', 1200),
('story_002', 'usr_002', 'Journey to the Unknown', 'journey-to-unknown', 'published', 'adventure', 850),
('story_003', 'usr_002', 'Love in the Time of AI', 'love-in-time-of-ai', 'draft', 'romance', 0);
```

### Demo Books
```sql
INSERT INTO books (id, owner_id, title, author_name, price, is_available) VALUES
('book_001', 'usr_002', 'The Art of Storytelling', 'Demo Writer', 29.99, true),
('book_002', 'usr_002', 'Advanced Writing Techniques', 'Demo Writer', 39.99, true);
```

### Demo Contests
```sql
INSERT INTO contests (id, publisher_id, title, description, status, category) VALUES
('contest_001', 'usr_003', 'Short Story Contest 2024', 'Write a short story about...', 'active', 'fiction');
```

---

## Test Data Seeds

### Test Users
```sql
INSERT INTO users (id, email, username, name, account_type) VALUES
('test_user_001', 'test1@hakawi.com', 'testuser1', 'Test User 1', 'reader'),
('test_user_002', 'test2@hakawi.com', 'testuser2', 'Test User 2', 'writer'),
('test_user_003', 'test3@hakawi.com', 'testuser3', 'Test User 3', 'admin');
```

### Test Stories
```sql
INSERT INTO stories (id, author_id, title, slug, status, category) VALUES
('test_story_001', 'test_user_002', 'Test Story 1', 'test-story-1', 'draft', 'fiction'),
('test_story_002', 'test_user_002', 'Test Story 2', 'test-story-2', 'published', 'adventure');
```

---

## Seed Execution

### Development Seeds
```bash
npm run seed:dev
```
- Loads reference data
- Loads demo data
- Creates demo users
- Sets up development environment

### Test Seeds
```bash
npm run seed:test
```
- Loads minimal reference data
- Loads test users
- Creates test scenarios
- Resets database state

### Demo Seeds
```bash
npm run seed:demo
```
- Loads all reference data
- Loads demo data
- Creates realistic sample content
- Prepares for demo/presentation

---

## Seed Management

### Adding New Seeds
1. Create seed file in `backend/src/seeds/`
2. Follow naming convention: `{category}.seed.ts`
3. Export async `run()` function
4. Register in seed index
5. Document seed purpose

### Updating Seeds
1. Never modify existing seed files
2. Create new versioned seed
3. Document what changed
4. Test migration path

### Removing Seeds
1. Mark as deprecated
2. Keep for rollback support
3. Remove after 2 releases

---

## Data Integrity

### Constraints
- Foreign key constraints enforced
- Unique constraints on business keys
- Check constraints for data validation
- Not null constraints where appropriate

### Validation
- All seed data validated against schemas
- Referential integrity checked
- Duplicate detection
- Data quality rules

---

*This document defines the seed data strategy for Hakawi.*
