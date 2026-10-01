import { transform as swcTransform } from '@swc/core';
import type { Plugin } from 'vite';

export function swcTypeScript(): Plugin {
  return {
    name: 'hakawi-swc-typescript',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('/node_modules/')) {
        return null;
      }

      const result = await swcTransform(code, {
        filename: id,
        sourceMaps: true,
        isModule: true,
        module: { type: 'es6' },
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          target: 'es2022',
          transform: { decoratorMetadata: true },
        },
      });

      return { code: result.code, map: result.map };
    },
  };
}
