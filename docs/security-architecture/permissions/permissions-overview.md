# Permissions Architecture
## Hakawi Security Architecture

This document defines the authorization and permissions architecture for Hakawi, including RBAC model, permission evaluation, ownership checks, and guard implementation.

---

## RBAC Model

### Roles

#### Account Types (User Roles)
| Role | Description | Access Level |
|------|-------------|--------------|
| `reader` | Default account for consuming content | Read published content |
| `writer` | Can publish stories and texties | Read + write own content |
| `rising_star` | Emerging author with limited features | Writer + analytics |
| `professional` | Full author features, book sales | Writer + book sales + rentals |
| `publisher` | Can create and manage contests | Writer + contest management |
| `admin` | Platform administration | Full system access |

#### Admin Sub-Roles
| Role | Description | Permissions |
|------|-------------|-------------|
| `super_admin` | Full system access | All permissions |
| `content_moderator` | Content moderation | moderate:content, reports:view |
| `financial_officer` | Financial operations | reports:view, users:manage (financial) |
| `verification_officer` | User verification | users:manage (verification) |

---

## Permission System

### Permission Format
```
{resource}:{action}:{scope}
```

**Examples:**
- `content:read` - Read any content
- `content:create` - Create new content
- `content:edit:own` - Edit own content
- `content:edit:all` - Edit any content
- `content:delete:own` - Delete own content
- `content:delete:all` - Delete any content
- `users:manage` - Manage users
- `settings:manage` - Manage settings
- `moderate:content` - Moderate content
- `contests:manage` - Manage contests

### Permission Hierarchy
```
content:read (base)
├── content:create
├── content:edit:own
├── content:edit:all
├── content:delete:own
└── content:delete:all
```

---

## Permission Evaluation

### Evaluation Order
1. **Super Admin Check** - Super admins have all permissions
2. **Role Check** - Check user's account type
3. **Permission Lookup** - Look up permissions for role
4. **Ownership Check** - Verify resource ownership (for :own permissions)
5. **Context Check** - Additional context validation

### Super Admin Whitelist
```typescript
function isVerifiedSuperAdmin(userId: string, accountType: AccountType, adminRole?: string): boolean {
  // Check whitelist first
  const superAdminIds = getSuperAdminGoogleIds();
  if (superAdminIds.includes(userId)) {
    return true;
  }
  
  // Check admin role
  return accountType === 'admin' && adminRole === 'super_admin';
}
```

### Ownership Check
```typescript
function checkOwnership(userId: string, resourceOwnerId: string): boolean {
  return userId === resourceOwnerId;
}
```

### Permission Lookup
```typescript
const PERMISSIONS_BY_ROLE = {
  reader: [
    'content:read',
    'profile:view',
    'comments:create',
    'comments:edit:own',
    'comments:delete:own',
    'reactions:use',
    'messages:send',
    'messages:read',
    'follow:use',
    'stories:read'
  ],
  writer: [
    // ... reader permissions
    'content:create',
    'content:edit:own',
    'content:delete:own',
    'stories:create',
    'stories:edit:own',
    'stories:delete:own'
  ],
  // ... other roles
};
```

---

## Authorization Guards

### AuthGuard
```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
```

### RolesGuard
```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.get('role', context.getHandler());
    const session = await auth();
    const userRole = session?.user?.accountType;
    
    if (!hasRole(userRole, requiredRole)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
```

### PermissionsGuard
```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get('permission', context.getHandler());
    const session = await auth();
    const user = await userRepository.findById(session.user.id);
    
    if (!hasPermission(user.accountType, requiredPermission, user.id, user.adminRole)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
```

### OwnershipGuard
```typescript
@Injectable()
export class OwnershipGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get('permission', context.getHandler());
    const session = await auth();
    const resourceOwnerId = this.getResourceOwnerId(context);
    
    if (requiredPermission.endsWith(':own')) {
      if (!checkOwnership(session.user.id, resourceOwnerId)) {
        throw new ForbiddenException();
      }
    }
    return true;
  }
}
```

---

## Usage in Controllers

### Example: Stories Controller
```typescript
@Controller('stories')
export class StoriesController {
  @Get(':id')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions('content:read')
  async getStory(@Param('id') id: string) {
    return this.storiesService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions('stories:create')
  async createStory(@Body() dto: CreateStoryDto) {
    return this.storiesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, PermissionsGuard, OwnershipGuard)
  @Permissions('stories:edit:own', 'stories:edit:all')
  async updateStory(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
    return this.storiesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, PermissionsGuard, OwnershipGuard)
  @Permissions('stories:delete:own', 'stories:delete:all')
  async deleteStory(@Param('id') id: string) {
    return this.storiesService.delete(id);
  }
}
```

---

## Permission Matrix

| Action | Reader | Writer | Rising Star | Professional | Publisher | Admin |
|--------|--------|--------|-------------|--------------|-----------|-------|
| Read published content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create story | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit own story | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete own story | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit any story | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Delete any story | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Moderate content | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage settings | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage contests | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## Fail-Closed Design

The permissions system follows a **fail-closed** approach:
- If permission check fails, deny access
- If ownership check fails, deny access
- If user not found, deny access
- If error occurs during check, deny access

This ensures that any failure in the authorization system results in denied access, not granted access.

---

## Audit Trail

All permission checks are logged:
- User ID
- Resource accessed
- Action attempted
- Permission checked
- Result (allowed/denied)
- Timestamp
- IP address

---

*This document defines the permissions architecture for Hakawi.*
