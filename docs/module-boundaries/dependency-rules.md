# Dependency Rules
## Hakawi Module Boundaries

This document defines dependency rules and circular dependency prevention for the Hakawi platform.

---

## Dependency Principles

### Design Rules
1. **Dependency Inversion**: Depend on abstractions, not concretions
2. **Acyclic Dependencies**: No circular dependencies
3. **Stable Directions**: Dependencies point inward (stable)
4. **Explicit Dependencies**: All dependencies declared
5. **Minimal Coupling**: Only depend on what you need

---

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                        Core Module                          │
│  (Shared types, utilities, base classes)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Users Module │   │ Auth Module   │   │ Config Module │
└───────┬───────┘   └───────────────┘   └───────────────┘
        │
        ▼
┌───────────────┐
│ Stories Module│
└───────┬───────┘
        │
        ▼
┌───────────────┐
│Interactions   │
│    Module     │
└───────┬───────┘
        │
   ┌────┴────┬────────┬────────┐
   │         │        │        │
   ▼         ▼        ▼        ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Notify│ │Msgs  │ │Books │ │Search│
│Module│ │Module│ │Module│ │Module│
└──────┘ └──────┘ └──────┘ └──────┘
```

---

## Dependency Rules

### Allowed Dependencies

| Module | Can Depend On |
|--------|---------------|
| Core | Nothing (leaf) |
| Users | Core, Config |
| Auth | Core, Users, Config |
| Stories | Core, Users, Categories, Config |
| Interactions | Core, Users, Stories, Notifications, Config |
| Notifications | Core, Users, Config |
| Messages | Core, Users, Config |
| Books | Core, Users, Payments, Config |
| Payments | Core, Users, Config |
| Search | Core, Users, Stories, Books, Config |

### Forbidden Dependencies

| Module | Cannot Depend On |
|--------|------------------|
| Core | Any module |
| Users | Stories, Interactions, Books, Payments |
| Stories | Interactions, Books, Payments |
| Interactions | Books, Payments |
| Notifications | Messages, Books, Payments |
| Messages | Books, Payments |
| Books | Interactions, Notifications |
| Payments | Stories, Interactions |

---

## Circular Dependency Prevention

### Detection Strategy

1. **Static Analysis**: Use tools like `madge` or `dependency-cruiser`
2. **Build Time Check**: Fail build on circular dependencies
3. **Code Review**: Manual review of new dependencies

### Prevention Techniques

#### 1. Interface Segregation

```typescript
// Good: Define interface in Core module
// core/interfaces/user.interface.ts
export interface IUserService {
  findById(id: string): Promise<User>;
}

// Users module implements the interface
@Injectable()
export class UsersService implements IUserService {
  findById(id: string): Promise<User> {
    // implementation
  }
}

// Stories module depends on interface only
@Injectable()
export class StoriesService {
  constructor(@Inject('IUserService') private userService: IUserService) {}
}
```

#### 2. Event-Driven Communication

```typescript
// Instead of direct call
await this.usersService.incrementStoryCount(userId);

// Emit event and let Users module handle it
await this.eventBus.emit(new StoryCreatedEvent(storyId, userId));
```

#### 3. Shared Kernel

```typescript
// Core module contains shared kernel
export class User {
  constructor(
    public id: string,
    public name: string,
    public email: string
  ) {}
}

// Both Users and Stories modules use the same User class
```

---

## Dependency Injection

### Module Configuration

```typescript
// Users module
@Module({
  providers: [
    UsersService,
    UsersRepository,
    {
      provide: 'IUsersService',
      useClass: UsersService
    }
  ],
  exports: ['IUsersService']
})
export class UsersModule {}

// Stories module
@Module({
  imports: [UsersModule],
  providers: [
    StoriesService,
    StoriesRepository,
    {
      provide: 'IStoriesService',
      useClass: StoriesService
    }
  ],
  exports: ['IStoriesService']
})
export class StoriesModule {}
```

### Dependency Scopes

| Scope | Lifetime | Use Case |
|-------|----------|----------|
| DEFAULT | Singleton | Stateless services |
| REQUEST | Per-request | Request-scoped data |
| TRANSIENT | Per-injection | Stateful services |

---

## Coupling Metrics

### Afferent Coupling (Incoming)

| Module | Afferent Coupling | Meaning |
|--------|-------------------|---------|
| Users | 8 | Used by many modules (stable) |
| Core | 9 | Used by all modules (very stable) |
| Stories | 3 | Used by Interactions, Search |
| Interactions | 1 | Used by Notifications |
| Books | 1 | Used by Payments |
| Payments | 0 | Leaf module |

### Efferent Coupling (Outgoing)

| Module | Efferent Coupling | Meaning |
|--------|-------------------|---------|
| Core | 0 | No dependencies (good) |
| Users | 2 | Depends on Core, Config |
| Stories | 4 | Depends on Core, Users, Categories, Config |
| Interactions | 5 | Depends on Core, Users, Stories, Notifications, Config |
| Books | 4 | Depends on Core, Users, Payments, Config |
| Payments | 3 | Depends on Core, Users, Config |

---

## Stability Metrics

### Stability Index

```
Stability = Efferent / (Afferent + Efferent)
```

| Module | Stability | Interpretation |
|--------|-----------|----------------|
| Core | 0.0 | Very stable (good) |
| Users | 0.2 | Stable (good) |
| Stories | 0.43 | Moderately stable |
| Interactions | 0.83 | Unstable (expected for leaf) |
| Books | 0.8 | Unstable (expected for leaf) |
| Payments | 1.0 | Very unstable (expected for leaf) |

### Abstractness Index

```
Abstractness = Abstract / (Abstract + Concrete)
```

| Module | Abstractness | Interpretation |
|--------|--------------|----------------|
| Core | 0.8 | Very abstract (good) |
| Users | 0.3 | Somewhat abstract |
| Stories | 0.2 | Mostly concrete |
| Interactions | 0.1 | Mostly concrete |
| Books | 0.1 | Mostly concrete |
| Payments | 0.1 | Mostly concrete |

---

## Module Boundaries

### Domain Boundaries

```
┌─────────────────────────────────────────┐
│         User Management Domain          │
│  (Users, Auth, Profiles, Settings)       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Content Domain                  │
│  (Stories, Comments, Categories, Tags)  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Social Domain                   │
│  (Follows, Reactions, Notifications)    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Commerce Domain                 │
│  (Books, Payments, Rentals, Library)    │
└─────────────────────────────────────────┘
```

### Context Mapping

| Domain | Relationship | Integration Point |
|--------|--------------|-------------------|
| Users → Stories | Downstream | User service API |
| Users → Interactions | Downstream | User service API |
| Stories → Interactions | Downstream | Story service API |
| Books → Payments | Downstream | Payment service API |

---

## Anti-Patterns to Avoid

### 1. God Module

```typescript
// Bad: Users module doing everything
@Injectable()
export class UsersService {
  createUser() {}
  createStory() {}
  createComment() {}
  sendNotification() {}
  processPayment() {}
}

// Good: Single responsibility
@Injectable()
export class UsersService {
  createUser() {}
  updateUser() {}
  deleteUser() {}
}
```

### 2. Circular Dependencies

```typescript
// Bad: Users depends on Stories, Stories depends on Users
@Injectable()
export class UsersService {
  constructor(private storiesService: StoriesService) {}
}

@Injectable()
export class StoriesService {
  constructor(private usersService: UsersService) {}
}

// Good: Use events or interface
@Injectable()
export class UsersService {
  constructor(private eventBus: EventBus) {}
  
  async createUser() {
    const user = await this.repository.create(data);
    await this.eventBus.emit(new UserCreatedEvent(user));
  }
}
```

### 3. Feature Envy

```typescript
// Bad: Stories module reaching into Users internals
@Injectable()
export class StoriesService {
  async publish(id: string) {
    const user = await this.usersService.findById(userId);
    if (user.settings.autoPublish) {
      // ...
    }
  }
}

// Good: Ask Users module
@Injectable()
export class StoriesService {
  async publish(id: string) {
    const canAutoPublish = await this.usersService.canAutoPublish(userId);
    if (canAutoPublish) {
      // ...
    }
  }
}
```

---

## Dependency Management

### Package Dependencies

```
backend/
├── package.json
│   ├── @nestjs/core
│   ├── @nestjs/common
│   ├── @nestjs/typeorm
│   ├── @nestjs/jwt
│   ├── @nestjs/passport
│   └── ...
```

### Internal Dependencies

```typescript
// Use path aliases for internal imports
{
  "compilerOptions": {
    "paths": {
      "@core/*": ["lib/core/*"],
      "@users/*": ["lib/users/*"],
      "@stories/*": ["lib/stories/*"],
      "@interactions/*": ["lib/interactions/*"],
      "@notifications/*": ["lib/notifications/*"],
      "@books/*": ["lib/books/*"],
      "@payments/*": ["lib/payments/*"]
    }
  }
}
```

---

## Refactoring Guidelines

### When to Refactor

- Circular dependency detected
- Module becomes too large (> 1000 lines)
- Module has too many responsibilities
- Dependency coupling increases

### Refactoring Strategies

1. **Extract Module**: Split large module into smaller ones
2. **Introduce Interface**: Decouple implementation
3. **Use Events**: Replace direct calls with events
4. **Move Method**: Move method to appropriate module
5. **Inline Class**: Remove unnecessary abstraction

---

*This document defines dependency rules for the Hakawi platform.*
