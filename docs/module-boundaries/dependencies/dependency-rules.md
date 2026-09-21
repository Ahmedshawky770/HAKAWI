# Dependency Rules
## Hakawi Module Boundaries

This document defines allowed dependency directions, forbidden couplings, and extension points for the Hakawi modular monolith.

---

## Dependency Graph

### Allowed Dependencies

```
Shared Kernel
    ↑
    ↑
All Modules
```

**Rule:** All modules can depend on the Shared Kernel, but the Shared Kernel cannot depend on any module.

### Module Dependencies

```
Auth Module → Users Module
Users Module → Auth Module (limited)
Stories Module → Users Module
Books Module → Users Module
Contests Module → Users Module
Notifications Module → Users Module
Messages Module → Users Module
Search Module → Stories Module
Moderation Module → Users Module
Payments Module → Users Module
```

**Rule:** Modules can only depend on other modules through well-defined interfaces, not internal implementation.

---

## Forbidden Couplings

### ❌ No Direct Database Access Across Modules
```typescript
// ❌ BAD: Stories module directly accessing Users table
const user = await db.query.users.findFirst({ where: ... });

// ✅ GOOD: Stories module using Users repository
const user = await this.usersRepository.findById(userId);
```

### ❌ No Direct Service Calls Across Modules
```typescript
// ❌ BAD: Stories module directly calling Users service
const user = await this.usersService.findById(userId);

// ✅ GOOD: Stories module using Users interface or events
const user = await this.usersRepository.findById(userId);
// OR
this.eventBus.publish(new StoryCreatedEvent(...));
// Users module listens and updates stats
```

### ❌ No Shared State
```typescript
// ❌ BAD: Sharing mutable state
export const currentUser = {};

// ✅ GOOD: Passing state through parameters
async function processStory(userId: string, story: Story) { ... }
```

### ❌ No Internal Dependencies
```typescript
// ❌ BAD: Importing internal implementation
import { UserServiceImpl } from '../users/services/user.service.impl';

// ✅ GOOD: Importing interface
import { IUsersService } from '../users/interfaces/users.service.interface';
```

---

## Dependency Injection

### Pattern
All dependencies injected through constructor:

```typescript
@Injectable()
export class StoriesService {
  constructor(
    private readonly storiesRepository: IStoriesRepository,
    private readonly usersRepository: IUsersRepository,
    private readonly eventBus: IEventBus,
    private readonly cacheService: ICacheService
  ) {}
}
```

### Benefits
- Loose coupling
- Easy testing (mock dependencies)
- Clear dependencies
- No hidden dependencies

---

## Event-Driven Communication

### Publishing Events
```typescript
// In StoriesService
async publish(storyId: string) {
  const story = await this.storiesRepository.update(storyId, { status: 'published' });
  
  await this.eventBus.publish({
    aggregateId: story.id,
    aggregateType: 'story',
    eventType: 'story.published',
    occurredAt: new Date(),
    payload: {
      storyId: story.id,
      authorId: story.authorId,
      title: story.title
    }
  });
}
```

### Subscribing to Events
```typescript
// In NotificationsModule
@OnEvent('story.published')
async handleStoryPublished(event: StoryPublishedEvent) {
  await this.notifyFollowers(event.payload.authorId, event.payload.storyId);
}
```

### Benefits
- Loose coupling
- Easy to add new listeners
- Async processing
- Audit trail

---

## Extension Points

### Strategy Pattern
```typescript
interface IPaymentProcessor {
  process(payment: Payment): Promise<PaymentResult>;
}

class PaymobProcessor implements IPaymentProcessor { ... }
class StripeProcessor implements IPaymentProcessor { ... }

// Usage
const processor = this.paymentProcessorFactory.create('paymob');
await processor.process(payment);
```

### Plugin Architecture
```typescript
interface IPlugin {
  name: string;
  version: string;
  initialize(context: PluginContext): void;
  shutdown(): void;
}

// Register plugins
this.pluginManager.register(new AnalyticsPlugin());
this.pluginManager.register(new NotificationPlugin());
```

### Middleware Pipeline
```typescript
// Add custom middleware
app.useGlobalPipes(new ValidationPipe());
app.useGlobalGuards(new AuthGuard(), new PermissionsGuard());
app.useGlobalInterceptors(new LoggingInterceptor(), new CacheInterceptor());
```

---

## Module Boundaries Enforcement

### Code Review Checklist
- [ ] No direct database access across modules
- [ ] No direct service calls across modules
- [ ] All dependencies injected
- [ ] Events used for cross-module communication
- [ ] No shared mutable state
- [ ] Interfaces used, not implementations

### Automated Checks
- ESLint rules for import restrictions
- Dependency graph visualization
- Architecture tests

---

## Refactoring Guidelines

### When to Refactor
- Module depends on internal implementation of another module
- Direct database access across modules
- Shared mutable state
- Circular dependencies

### How to Refactor
1. Define interface in consuming module
2. Implement interface in providing module
3. Use dependency injection
4. Replace direct calls with interface calls
5. Remove direct dependencies

---

*This document defines dependency rules for Hakawi.*
