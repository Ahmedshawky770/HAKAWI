# Authorization
## Hakawi Security Architecture

This document defines the authorization system for the Hakawi platform.

---

## Authorization Overview

Hakawi uses Role-Based Access Control (RBAC) with additional attribute-based checks for fine-grained permissions.

---

## RBAC Model

### Roles

| Role | Description | Default Permissions |
|------|-------------|---------------------|
| Guest | Unauthenticated user | Read public content |
| Reader | Authenticated reader | Read stories, follow users |
| Writer | Content creator | Create stories, manage own content |
| Publisher | Content manager | Manage writers, create contests |
| Moderator | Content moderator | Moderate content, manage reports |
| Admin | System administrator | Full system access |
| Super Admin | Platform owner | Unrestricted access |

### Permission Inheritance

```
Super Admin → Admin → Moderator → Publisher → Writer → Reader → Guest
```

Each role inherits permissions from roles below it.

---

## Permission Structure

### Permission Format

```
{resource}:{action}:{conditions}
```

**Examples:**
- `story:read:public` - Read public stories
- `story:create:own` - Create own stories
- `story:update:own` - Update own stories
- `story:delete:own` - Delete own stories
- `story:delete:any` - Delete any story (admin)
- `user:update:own` - Update own profile
- `user:ban:any` - Ban any user (moderator)

### Resource Types

| Resource | Actions |
|----------|---------|
| story | read, create, update, delete, publish |
| comment | read, create, update, delete |
| user | read, update, delete, ban, verify |
| book | read, create, update, delete, purchase |
| contest | read, create, update, delete, submit, vote |
| notification | read, update |
| message | read, create, update, delete |
| report | read, create, update, resolve |
| media | read, create, update, delete |

---

## Authorization Flow

### Request Authorization

```
1. User sends request with JWT token
2. Backend validates token
3. Backend extracts user role
4. Backend checks required permission
5. Backend verifies ownership (if applicable)
6. Backend allows or denies access
7. Backend logs authorization decision
```

### Permission Check

```typescript
function canAccess(user: User, resource: string, action: string, resourceId?: string): boolean {
  // 1. Check role-based permission
  if (!hasRolePermission(user.role, resource, action)) {
    return false;
  }
  
  // 2. Check ownership (if applicable)
  if (requiresOwnership(resource, action) && resourceId) {
    if (!isOwner(user.id, resourceId)) {
      return false;
    }
  }
  
  // 3. Check additional conditions
  if (hasConditions(resource, action)) {
    return evaluateConditions(user, resource, action, resourceId);
  }
  
  return true;
}
```

---

## Ownership Rules

### Ownership Definition

- **Stories**: Owned by the author
- **Comments**: Owned by the commenter
- **Books**: Owned by the author
- **Submissions**: Owned by the submitter
- **Messages**: Owned by the sender/recipient
- **Profiles**: Owned by the user

### Ownership Check

```typescript
function isOwner(userId: string, resourceId: string, resourceType: string): boolean {
  switch (resourceType) {
    case 'story':
      return db.stories.findOne(resourceId).authorId === userId;
    case 'comment':
      return db.comments.findOne(resourceId).userId === userId;
    case 'book':
      return db.books.findOne(resourceId).authorId === userId;
    default:
      return false;
  }
}
```

---

## Special Permissions

### Admin Override

- Admins can access any resource
- Admins can perform any action
- Admin actions are logged
- Admin override is audited

### Super Admin

- Super admin has unrestricted access
- Super admin can manage other admins
- Super admin can access system settings
- Super admin actions are logged

### Moderator Special Cases

- Moderators can view reported content
- Moderators can take moderation actions
- Moderators cannot access admin-only features
- Moderator actions are logged

---

## API Endpoint Authorization

### Public Endpoints (No Auth Required)

| Endpoint | Method | Permission |
|----------|--------|------------|
| /api/v1/auth/register | POST | None |
| /api/v1/auth/login | POST | None |
| /api/v1/stories | GET | story:read:public |
| /api/v1/stories/:id | GET | story:read:public |
| /api/v1/authors | GET | user:read:public |

### Protected Endpoints (Auth Required)

| Endpoint | Method | Required Role | Permission |
|----------|--------|---------------|------------|
| /api/v1/stories | POST | Writer+ | story:create:own |
| /api/v1/stories/:id | PUT | Writer+ | story:update:own |
| /api/v1/stories/:id | DELETE | Writer+ | story:delete:own |
| /api/v1/users/:id | PUT | Authenticated | user:update:own |
| /api/v1/users/:id/ban | POST | Moderator+ | user:ban:any |

---

## Authorization Guards

### Guard Implementation

```typescript
@Controller('stories')
export class StoriesController {
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('story:create:own')
  async create(@CurrentUser() user: User, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(user.id, dto);
  }
  
  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('story:update:own')
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateStoryDto
  ) {
    return this.storiesService.update(user.id, id, dto);
  }
}
```

### Permission Guard

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private authService: AuthService) {}
  
  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>('permissions', context.getHandler());
    if (!requiredPermissions) {
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    return requiredPermissions.every(permission => 
      this.authService.canAccess(user, permission)
    );
  }
}
```

---

## Attribute-Based Access Control (ABAC)

### Attributes

| Attribute | Source | Example |
|-----------|--------|---------|
| User role | User.role | 'writer' |
| User status | User.status | 'active' |
| Resource owner | Resource.userId | 'user-uuid' |
| Resource status | Resource.status | 'published' |
| Time | Date/Time | Business hours only |
| IP | Request IP | Internal network |

### ABAC Policies

```typescript
const policies = [
  {
    name: 'Publish story',
    condition: (user, story) => 
      user.role === 'writer' && 
      story.authorId === user.id && 
      story.status === 'draft'
  },
  {
    name: 'Moderate content',
    condition: (user) => 
      ['moderator', 'admin', 'super_admin'].includes(user.role)
  },
  {
    name: 'Access admin panel',
    condition: (user) => 
      ['admin', 'super_admin'].includes(user.role)
  }
];
```

---

## Authorization Logging

### Logged Events

| Event | Log Level |
|-------|-----------|
| Authorization success | DEBUG |
| Authorization failure | WARN |
| Admin override | INFO |
| Permission change | INFO |

### Log Format

```json
{
  "timestamp": "YYYY-MM-DDTHH:mm:ssZ",
  "level": "WARN",
  "event": "authorization_failure",
  "userId": "user-uuid",
  "role": "writer",
  "resource": "story",
  "action": "delete",
  "resourceId": "story-uuid",
  "reason": "Not owner"
}
```

---

## Testing Authorization

### Test Cases

1. **Role-based access**
   - Reader cannot create stories
   - Writer can create stories
   - Admin can delete any story

2. **Ownership checks**
   - User cannot update other's story
   - User can update own story
   - Admin can update any story

3. **Edge cases**
   - Deactivated user cannot access
   - Expired token is rejected
   - Invalid token is rejected

---

## Security Considerations

### Privilege Escalation

- Never trust client-side role checks
- Always validate on server
- Log all authorization decisions
- Regular audit of permissions

### Token Manipulation

- Validate token signature
- Check token expiration
- Verify token claims
- Blacklist revoked tokens

### Session Fixation

- Generate new session on login
- Invalidate old sessions
- Use secure session IDs

---

*This document defines the authorization system for the Hakawi platform.*
