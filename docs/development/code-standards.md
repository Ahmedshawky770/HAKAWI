# Code Standards
## Hakawi - Coding Guidelines

---

## General Principles

1. **Readability over cleverness** — Code is read more than written
2. **Consistency over preference** — Follow existing patterns
3. **Type safety over convenience** — No `any` types
4. **Explicit over implicit** — Avoid magic, be clear
5. **Single responsibility** — Each function/class does one thing

---

## TypeScript Standards

### No `any` Types

```typescript
// ❌ BAD
const data: any = response.data;

// ✅ GOOD
interface ResponseData {
  id: string;
  name: string;
}
const data: ResponseData = response.data;
```

### Type Inference

```typescript
// ✅ GOOD - Let TypeScript infer
const count = 42;
const name = "Hakawi";

// ❌ BAD - Unnecessary explicit types
const count: number = 42;
const name: string = "Hakawi";
```

### Interfaces over Types

```typescript
// ✅ GOOD - Use interface for objects
interface User {
  id: string;
  name: string;
}

// Use type for unions/intersections
type UserId = string;
type UserRole = "reader" | "writer" | "admin";
```

### Null Safety

```typescript
// ✅ GOOD - Use optional chaining and nullish coalescing
const userName = user?.profile?.name ?? "Anonymous";

// ❌ BAD - Null checks everywhere
let userName = "Anonymous";
if (user && user.profile && user.profile.name) {
  userName = user.profile.name;
}
```

---

## NestJS Standards

### Module Structure

```
modules/
├── users/
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   └── update-user.dto.ts
│   ├── interfaces/
│   │   └── user.interface.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── users.repository.ts
│   └── users.module.ts
```

### Controllers

```typescript
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
}
```

### Services

```typescript
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
```

### Repositories

```typescript
@Injectable()
export class UsersRepository {
  constructor(
    @Inject('DATABASE') private readonly db: Database,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
  }
}
```

---

## Naming Conventions

### Files

- **Controllers:** `*.controller.ts`
- **Services:** `*.service.ts`
- **Repositories:** `*.repository.ts`
- **DTOs:** `*.dto.ts`
- **Interfaces:** `*.interface.ts`
- **Entities:** `*.entity.ts`
- **Constants:** `*.constants.ts`

### Classes

- **PascalCase** for classes and interfaces: `UserService`, `CreateUserDto`
- **camelCase** for methods and properties: `findById()`, `userName`
- **UPPER_SNAKE_CASE** for constants: `MAX_RETRIES`, `DEFAULT_TIMEOUT`

### Database

- **snake_case** for tables and columns: `users`, `created_at`, `is_verified`
- **Plural** for table names: `users`, `stories`, `notifications`
- **Singular** for foreign keys: `user_id`, `story_id`

---

## Error Handling

### Use NestJS Exception Filters

```typescript
// ✅ GOOD - Throw HTTP exceptions
if (!user) {
  throw new NotFoundException('User not found');
}

if (user.email !== email) {
  throw new ForbiddenException('Invalid credentials');
}

// ❌ BAD - Return error objects
if (!user) {
  return { error: 'User not found', statusCode: 404 };
}
```

### Custom Exceptions

```typescript
export class PaymentFailedException extends BadRequestException {
  constructor(reason: string) {
    super(`Payment failed: ${reason}`);
  }
}

// Usage
throw new PaymentFailedException('Insufficient funds');
```

### Error Response Format

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ],
  "statusCode": 400,
  "timestamp": "2026-09-19T10:00:00Z",
  "path": "/api/v1/auth/register",
  "correlationId": "abc123"
}
```

---

## Validation

### Use DTOs with class-validator

```typescript
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
```

### Validation Pipe

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
}));
```

---

## Logging

### Use Logger Service

```typescript
@Injectable()
export class UsersService {
  constructor(private readonly logger: LoggerService) {}

  async create(dto: CreateUserDto) {
    this.logger.log('Creating user', { email: dto.email });
    // ...
  }
}
```

### Log Levels

- **debug:** Detailed diagnostic information
- **info:** General informational messages
- **warn:** Warning messages
- **error:** Error messages

### Log Format

```typescript
this.logger.log('User created', {
  userId: user.id,
  email: user.email,
  correlationId: req.correlationId,
});
```

---

## Database

### Use Drizzle ORM

```typescript
// ✅ GOOD - Type-safe queries
const user = await db.query.users.findFirst({
  where: eq(users.id, userId),
});

// ❌ BAD - Raw SQL
const user = await db.execute(sql`SELECT * FROM users WHERE id = ${userId}`);
```

### Migrations

```bash
# Generate migration
npm run migration:generate -- add_user_preferences

# Run migrations
npm run migration:run

# Revert migration
npm run migration:revert
```

### Query Best Practices

- Use parameterized queries (Drizzle does this automatically)
- Index foreign keys
- Avoid SELECT *
- Use transactions for multi-step operations

---

## Frontend Standards

### Component Structure

```
components/
├── ui/                    # Shadcn UI components
├── features/             # Feature-specific components
│   ├── stories/
│   │   ├── StoryCard.tsx
│   │   ├── StoryList.tsx
│   │   └── StoryCreator.tsx
│   └── users/
│       ├── UserProfile.tsx
│       └── UserCard.tsx
└── layouts/              # Layout components
    ├── Header.tsx
    ├── Sidebar.tsx
    └── BottomNav.tsx
```

### Component Naming

- **PascalCase** for components: `StoryCard.tsx`
- **camelCase** for utilities: `formatDate.ts`
- **kebab-case** for styles: `story-card.module.css`

### State Management

```typescript
// Server state: TanStack Query
const { data, isLoading } = useQuery({
  queryKey: ['stories', page],
  queryFn: () => fetchStories(page),
});

// Client state: useState
const [isOpen, setIsOpen] = useState(false);

// Form state: React Hook Form
const { register, handleSubmit } = useForm();
```

---

## Git Standards

### Commit Messages

```
feat: add user registration endpoint
fix: fix pagination bug in stories list
docs: update API documentation
test: add unit tests for payments service
refactor: extract payment validation logic
chore: update dependencies
```

### Branch Naming

```
feat/user-authentication
fix/story-pagination
docs/api-documentation
test/payment-service
```

---

## Pre-commit Hooks

Use Husky and lint-staged:

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

## Code Review Checklist

- [ ] No `any` types
- [ ] No console.log statements
- [ ] All functions have JSDoc comments
- [ ] All errors are handled
- [ ] All user inputs are validated
- [ ] All database queries use parameterized queries
- [ ] All new features have tests
- [ ] Code follows naming conventions
- [ ] No hardcoded values (use constants)
- [ ] All environment variables are documented

---

*This document defines the code standards for Hakawi.*
