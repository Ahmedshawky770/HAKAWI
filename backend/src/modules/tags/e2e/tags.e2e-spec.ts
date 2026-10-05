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
 * ordinary reader, and post to `POST /tags`. That route is `@Secured(AccountType.ADMIN)` +
 * `@RequireAdminRole(AdminRole.CONTENT_MODERATOR)` + `@RequirePermissions(Permission.CONTENT_EDIT_ALL)`
 * (`tags.controller.ts`), so the write routes answered 403 and the assertions below were being run
 * against a body that never arrived.
 *
 * `createTestContext` is the harness every `test/*.integration-spec.ts` already uses and it owns
 * `promoteToAdmin`, so the fixture can hold an account that is actually allowed to do this — and,
 * more importantly, it owns `login`, which is what makes a freshly promoted account's token valid.
 */
describe('Tags E2E', () => {
  let context: TestContext;
  let moderatorToken: string;
  let readerToken: string;

  beforeAll(async () => {
    context = await createTestContext();

    const moderator = await context.registerAndLogin({ prefix: 'tagsmod', name: 'E2E Tags Moderator' });
    await context.promoteToAdmin(moderator.id, AdminRole.CONTENT_MODERATOR);
    // WHY A SECOND LOGIN AND NOT THE TOKEN `registerAndLogin` RETURNED: the access token carries the
    // `account_type` / `admin_role` claims as they stood when it was minted, so the pre-promotion
    // token is refused by `RolesGuard` and `PermissionsGuard` even though the row is already an
    // admin's. `moderation.integration-spec.ts` pins that behaviour deliberately.
    moderatorToken = (await context.login(moderator.email)).accessToken;

    // Kept so the write routes are pinned as MODERATOR-only and not merely "some signed-in user".
    readerToken = (await context.registerAndLogin({ prefix: 'tagsreader' })).accessToken;
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  describe('GET /tags', () => {
    it('should return tags', async () => {
      const res = await request(context.httpServer).get('/tags').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /tags', () => {
    it('should create a tag', async () => {
      const res = await request(context.httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ name: 'E2E Romance', slug: `e2e-romance-${Date.now()}` })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('E2E Romance');
    });

    /**
     * WHY THIS ASSERTION EXISTS RATHER THAN THE 403 BEING DELETED ALONG WITH THE FIX.
     *
     * Tags are the other half of the taxonomy and carry the same curation requirement as categories,
     * so the 403 this file used to fail on was the route being correct. The fix was to give the
     * fixture a privileged account, not to relax the route.
     */
    it('should refuse an ordinary reader', async () => {
      await request(context.httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ name: 'Reader Romance', slug: `reader-romance-${Date.now()}` })
        .expect(403);
    });
  });

  describe('PATCH /tags/:id', () => {
    it('should update a tag', async () => {
      const createRes = await request(context.httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ name: 'E2E Romance Update', slug: `e2e-romance-update-${Date.now()}` })
        .expect(201);

      const tagId = createRes.body.id as string;

      const res = await request(context.httpServer)
        .patch(`/tags/${tagId}`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ name: 'E2E Romance Updated' })
        .expect(200);

      expect(res.body.name).toBe('E2E Romance Updated');
    });

    it('should refuse an ordinary reader', async () => {
      const createRes = await request(context.httpServer)
        .post('/tags')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ name: 'E2E Romance Guard', slug: `e2e-romance-guard-${Date.now()}` })
        .expect(201);

      await request(context.httpServer)
        .patch(`/tags/${createRes.body.id as string}`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ name: 'Hijacked Romance' })
        .expect(403);
    });
  });
});
