import request from 'supertest';

import { AdminRole } from '../../../common/constants/roles.ts';
import { createTestContext } from '../../../test/helpers/test-context.ts';
import type { TestContext } from '../../../test/helpers/test-context.ts';

// Supertest response bodies are typed as `any` by the library.
// Accepted external-library typing limitation — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

/**
 * WHY THIS FILE USES THE SHARED HARNESS INSTEAD OF BUILDING ITS OWN APP.
 *
 * It used to bootstrap a bare `Test.createTestingModule({ imports: [AppModule] })`, register an
 * ordinary reader, and post to `POST /categories`. That route is `@Secured(AccountType.ADMIN)` +
 * `@RequireAdminRole(AdminRole.CONTENT_MODERATOR)` + `@RequirePermissions(Permission.CONTENT_EDIT_ALL)`
 * (`categories.controller.ts`), so the write routes answered 403 and the assertions below were
 * rewritten by hand around a body that never arrived.
 *
 * `createTestContext` is the harness every `test/*.integration-spec.ts` already uses and it owns
 * `promoteToAdmin`, so the fixture can hold an account that is actually allowed to do this — and,
 * more importantly, it owns `login`, which is what makes a freshly promoted account's token valid.
 */
describe('Categories E2E', () => {
  let context: TestContext;
  let moderatorToken: string;
  let readerToken: string;

  beforeAll(async () => {
    context = await createTestContext();

    const moderator = await context.registerAndLogin({ prefix: 'categoriesmod', name: 'E2E Categories Moderator' });
    await context.promoteToAdmin(moderator.id, AdminRole.CONTENT_MODERATOR);
    // WHY A SECOND LOGIN AND NOT THE TOKEN `registerAndLogin` RETURNED: the access token carries the
    // `account_type` / `admin_role` claims as they stood when it was minted, so the pre-promotion
    // token is refused by `RolesGuard` and `PermissionsGuard` even though the row is already an
    // admin's. `moderation.integration-spec.ts` pins that behaviour deliberately.
    moderatorToken = (await context.login(moderator.email)).accessToken;

    // Kept so the write routes are pinned as MODERATOR-only and not merely "some signed-in user".
    readerToken = (await context.registerAndLogin({ prefix: 'categoriesreader' })).accessToken;
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  describe('GET /categories', () => {
    it('should return categories', async () => {
      const res = await request(context.httpServer).get('/categories').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /categories', () => {
    it('should create a category', async () => {
      const res = await request(context.httpServer)
        .post('/categories')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ name: 'E2E Fiction', slug: `e2e-fiction-${Date.now()}`, description: 'E2E test category' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('E2E Fiction');
    });

    /**
     * WHY THIS ASSERTION EXISTS RATHER THAN THE 403 BEING DELETED ALONG WITH THE FIX.
     *
     * Taxonomy is not self-service: a reader who could name a category could choose what the whole
     * catalogue is filed under. So the 403 this file used to fail on was the route being correct, and
     * the fix was to give the fixture a privileged account — not to relax the route.
     */
    it('should refuse an ordinary reader', async () => {
      await request(context.httpServer)
        .post('/categories')
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ name: 'Reader Fiction', slug: `reader-fiction-${Date.now()}` })
        .expect(403);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('should update a category', async () => {
      const createRes = await request(context.httpServer)
        .post('/categories')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({
          name: 'E2E Fiction Update',
          slug: `e2e-fiction-update-${Date.now()}`,
          description: 'E2E test category',
        })
        .expect(201);

      const categoryId = createRes.body.id as string;

      const res = await request(context.httpServer)
        .patch(`/categories/${categoryId}`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ name: 'E2E Fiction Updated' })
        .expect(200);

      expect(res.body.name).toBe('E2E Fiction Updated');
    });

    it('should refuse an ordinary reader', async () => {
      const createRes = await request(context.httpServer)
        .post('/categories')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ name: 'E2E Fiction Guard', slug: `e2e-fiction-guard-${Date.now()}` })
        .expect(201);

      await request(context.httpServer)
        .patch(`/categories/${createRes.body.id as string}`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ name: 'Hijacked Fiction' })
        .expect(403);
    });
  });
});
