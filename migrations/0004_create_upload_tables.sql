CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,
  url TEXT NOT NULL,
  cdn_url TEXT,
  uploaded_by_id UUID REFERENCES users(id),
  story_id UUID REFERENCES stories(id),
  deleted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_filename ON uploads(filename);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_by_id ON uploads(uploaded_by_id);
CREATE INDEX IF NOT EXISTS idx_uploads_story_id ON uploads(story_id);
