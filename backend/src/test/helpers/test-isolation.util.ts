import { ValkeyService } from '../../common/services/valkey.service.ts';

const TEST_PREFIX = 'test:';

export async function cleanValkey(valkeyService: ValkeyService | null): Promise<void> {
  if (!valkeyService) {
    return;
  }

  try {
    const keys = await valkeyService.keys(`${TEST_PREFIX}*`);
    if (keys.length > 0) {
      await Promise.all(keys.map((key) => valkeyService.del(key)));
    }
  } catch {
    return;
  }
}

export function getTestPrefix(): string {
  return TEST_PREFIX;
}
