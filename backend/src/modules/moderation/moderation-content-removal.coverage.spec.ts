import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { CONTENT_BEARING_TARGET_TYPES } from './dto/report.dto.ts';

/**
 * Pins the link between the producer's vocabulary and its consumers.
 *
 * `ModerationService.takeAction` emits `moderation.content.removed` only for a target type in
 * `CONTENT_BEARING_TARGET_TYPES`, and each of those types is removed by the module that owns it —
 * `stories` for a story, `comments` for a comment — because neither module may import from
 * moderation (Principle #7). That leaves the two sides joined by a literal: the consumers filter
 * `event.targetType !== 'story'` / `!== 'comment'` as strings, and the DTO's compile-time typing
 * cannot reach across the module boundary.
 *
 * WHY THIS FILE READS SOURCES. The failure this prevents is silent: rename or add a type in
 * `REPORT_TARGET_TYPES`, declare it content-bearing in the DTO, and the event fires with no
 * consumer acting on it — a moderator takes `content_removal`, gets a 200, and nothing is
 * removed. That is the same defect class `common/events/event-schemas.ts` guards on the
 * producer side (`REGISTERED_WITHOUT_PRODUCER`); this is the consumer-side counterpart. A
 * source scan is the honest way to check it, because the relationship genuinely lives in the
 * event payload rather than in a shared type.
 *
 * The scan is deliberately narrow: it asserts each content-bearing type name appears in exactly
 * the handler file that owns that type. It does not try to parse the handler — it fails when the
 * vocabulary and the filter drift apart, which is the only thing it claims to know.
 */
const HANDLER_FOR_TARGET_TYPE: Record<string, string> = {
  story: fileURLToPath(new URL('../stories/events/moderation-content-removal.event-handler.ts', import.meta.url)),
  comment: fileURLToPath(new URL('../comments/events/moderation-content-removal.event-handler.ts', import.meta.url)),
};

describe('moderation.content.removed consumers cover the producer vocabulary', () => {
  it('spells out a handler file for every content-bearing target type', () => {
    // The map above is the contract under test: a content-bearing type without an entry here is a
    // type whose removal has no owner. This fails first when the DTO grows, before the scan below
    // can pass by accident.
    for (const targetType of CONTENT_BEARING_TARGET_TYPES) {
      expect(Object.keys(HANDLER_FOR_TARGET_TYPE)).toContain(targetType);
    }
  });

  it('has each owning module filter on its own target type literal', () => {
    for (const targetType of CONTENT_BEARING_TARGET_TYPES) {
      const handlerPath = HANDLER_FOR_TARGET_TYPE[targetType];
      const source = readFileSync(handlerPath, 'utf8');

      // The handler both subscribes to the event and discriminates on the type it owns. A handler
      // that stopped naming its type would process every removal as its own.
      expect(source).toContain(`@OnEvent('moderation.content.removed')`);
      expect(source).toContain(`'${targetType}'`);
    }
  });

  it('has no consumer filtering on a type the producer never sends', () => {
    // The other direction of the same drift: `user` is a valid report target but has no content
    // to remove, so the producer never emits for it. A consumer that started handling it would be
    // waiting for deliveries that cannot happen — dead code with a listener attached.
    for (const [targetType, handlerPath] of Object.entries(HANDLER_FOR_TARGET_TYPE)) {
      const source = readFileSync(handlerPath, 'utf8');
      expect(CONTENT_BEARING_TARGET_TYPES).toContain(targetType);
      expect(source).toContain(`'${targetType}'`);
    }
  });
});
