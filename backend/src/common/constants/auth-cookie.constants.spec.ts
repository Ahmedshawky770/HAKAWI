import { describe, it, expect, afterEach } from 'vitest';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  buildAuthCookieOptions,
  parseCookieHeader,
} from './auth-cookie.constants.ts';

describe('parseCookieHeader', () => {
  it('reads a single cookie', () => {
    expect(parseCookieHeader('refresh_token=abc')).toEqual({ refresh_token: 'abc' });
  });

  it('reads a jar of cookies, trimming the padding around each name', () => {
    expect(parseCookieHeader('access_token=aaa; refresh_token=bbb; other=ccc')).toEqual({
      access_token: 'aaa',
      refresh_token: 'bbb',
      other: 'ccc',
    });
  });

  it('keeps a value that contains an equals sign intact', () => {
    expect(parseCookieHeader('token=a=b=c')).toEqual({ token: 'a=b=c' });
  });

  it('percent-decodes a value', () => {
    expect(parseCookieHeader('name=Ahmed%20Shawky')).toEqual({ name: 'Ahmed Shawky' });
  });

  it('falls back to the raw value when it is not valid percent encoding', () => {
    expect(parseCookieHeader('name=100%')).toEqual({ name: '100%' });
  });

  it('returns an empty jar for an absent or empty header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
  });

  it('ignores segments that carry no name', () => {
    expect(parseCookieHeader('=orphan; valid=1; ; =2')).toEqual({ valid: '1' });
  });

  it('reads an empty value rather than dropping the cookie', () => {
    expect(parseCookieHeader('access_token=')).toEqual({ access_token: '' });
  });

  it('lets a later duplicate win, matching how browsers resolve a jar', () => {
    expect(parseCookieHeader('refresh_token=first; refresh_token=second')).toEqual({ refresh_token: 'second' });
  });
});

describe('buildAuthCookieOptions', () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
  });

  it('is http-only, strict, rooted and secure outside development', () => {
    process.env.NODE_ENV = 'production';

    expect(buildAuthCookieOptions(ACCESS_TOKEN_TTL_MS)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
  });

  it('drops the secure flag outside production so plain-HTTP development works', () => {
    process.env.NODE_ENV = 'development';

    expect(buildAuthCookieOptions(REFRESH_TOKEN_TTL_MS)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  });

  it('keeps the documented cookie names and lifetimes', () => {
    expect(ACCESS_TOKEN_COOKIE).toBe('access_token');
    expect(REFRESH_TOKEN_COOKIE).toBe('refresh_token');
    expect(ACCESS_TOKEN_TTL_MS).toBe(900_000);
    expect(REFRESH_TOKEN_TTL_MS).toBe(604_800_000);
  });
});
