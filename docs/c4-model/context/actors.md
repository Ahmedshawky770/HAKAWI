# Actors
## Hakawi C4 - Context View

**Purpose:** Describe who interacts with the system.

**Actors:**
- Reader
- Writer
- Publisher
- Admin / Moderator
- Guest
- System / background jobs

Each actor interacts primarily through the frontend container, except external integrations which call backend APIs or webhooks.
