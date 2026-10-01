/// <reference types="@testing-library/jest-dom/vitest" />

import fs from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

const APP_DIR = __dirname;
const SRC_DIR = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function toRoute(file: string): string | null {
  if (!file.endsWith("page.tsx")) return null;
  const relative = path
    .relative(APP_DIR, file)
    .replace(/\\/g, "/")
    .replace(/\/page\.tsx$/, "");
  const segments = relative
    .split("/")
    .filter((segment) => segment.length > 0 && !(segment.startsWith("(") && segment.endsWith(")")));
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

const ROUTES = new Set(
  walk(APP_DIR)
    .map(toRoute)
    .filter((route): route is string => route !== null),
);

const SOURCE_FILES = walk(SRC_DIR).filter(
  (file) =>
    (file.endsWith(".ts") || file.endsWith(".tsx")) &&
    !file.includes(`${path.sep}test-utils${path.sep}`) &&
    !file.includes(".test."),
);

const STATIC_HREF = /href="(\/[^"'#?]*)/g;
const STATIC_PUSH = /(?:push|replace)\(\s*"(\/[^"'#?]*)/g;
const OBJECT_HREF = /href:\s*"(\/[^"'#?]*)/g;
const OBJECT_HREF_CONST = /href:\s*([A-Z][A-Z0-9_]*)\b/g;
const EXPORTED_STRING_CONST = /export const ([A-Z][A-Z0-9_]*) = "([^"]*)"/g;
const TEMPLATE_HREF = /href=\{`(\/[^`?]*)/g;
const TEMPLATE_PUSH = /(?:push|replace)\(`(\/[^`?]*)/g;

const CONSTANTS = new Map<string, string>();
for (const file of SOURCE_FILES) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(EXPORTED_STRING_CONST)) {
    const [, name, value] = match;
    if (name && value !== undefined) CONSTANTS.set(name, value);
  }
}

function staticTargets(source: string): string[] {
  return [...[...source.matchAll(STATIC_HREF), ...source.matchAll(STATIC_PUSH), ...source.matchAll(OBJECT_HREF)]].map(
    (match) => match[1] ?? "",
  );
}

function constTargets(source: string): string[] {
  return [...source.matchAll(OBJECT_HREF_CONST)].map((match) => {
    const name = match[1] ?? "";
    return CONSTANTS.get(name) ?? `unresolved:${name}`;
  });
}

function templateTargets(source: string): string[] {
  return [...source.matchAll(TEMPLATE_HREF), ...source.matchAll(TEMPLATE_PUSH)].map((match) => match[1] ?? "");
}

function matchesRoute(target: string, route: string): boolean {
  if (target === route) return true;
  const targetParts = target.split("/").filter(Boolean);
  const routeParts = route.split("/").filter(Boolean);
  if (targetParts.length > routeParts.length) return false;
  return targetParts.every((part, index) => part.startsWith("[") || part === routeParts[index]);
}

function matchesTemplateTarget(target: string, route: string): boolean {
  const pattern = target.replace(/\$\{[^}]*\}/g, "[param]");
  const targetParts = pattern.split("/").filter(Boolean);
  const routeParts = route.split("/").filter(Boolean);
  if (targetParts.length !== routeParts.length) return false;
  return targetParts.every((part, index) => {
    const routePart = routeParts[index] ?? "";
    if (part === "[param]") return routePart.startsWith("[");
    return part === routePart;
  });
}

describe("app route map", () => {
  it("discovers at least the documented routes", () => {
    for (const route of ["/", "/login", "/register", "/forgot-password", "/reset-password"]) {
      expect(ROUTES.has(route)).toBe(true);
    }
  });

  it("maps no route to the removed dashboard path", () => {
    expect(ROUTES.has("/dashboard")).toBe(false);
  });

  it("resolves the root route to exactly one page file", () => {
    const rootPages = walk(APP_DIR).filter((file) => toRoute(file) === "/" && file.endsWith("page.tsx"));
    expect(rootPages.map((file) => path.relative(SRC_DIR, file))).toEqual([path.join("app", "(app)", "page.tsx")]);
  });

  it("points every static link and redirect at a route that exists", () => {
    const dead: string[] = [];
    for (const file of SOURCE_FILES) {
      const source = fs.readFileSync(file, "utf8");
      for (const target of [...staticTargets(source), ...constTargets(source)]) {
        if (![...ROUTES].some((route) => matchesRoute(target, route))) {
          dead.push(`${path.relative(SRC_DIR, file)} -> ${target}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it("points every templated link at a route pattern that exists", () => {
    const dead: string[] = [];
    for (const file of SOURCE_FILES) {
      const source = fs.readFileSync(file, "utf8");
      for (const target of templateTargets(source)) {
        if (![...ROUTES].some((route) => matchesTemplateTarget(target, route))) {
          dead.push(`${path.relative(SRC_DIR, file)} -> ${target}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });
});
