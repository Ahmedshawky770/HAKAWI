import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

import { SwaggerAuthMiddleware } from "./swagger-auth.middleware.ts";

const MOCK_JWT_PAYLOAD = {
  sub: "user-1",
  email: "ahmed@example.com",
  accountType: "reader",
  adminRole: undefined as string | undefined,
} as const;

const MOCK_SUPER_ADMIN_PAYLOAD = {
  sub: "admin-1",
  email: "admin@example.com",
  accountType: "admin",
  adminRole: "super_admin" as string,
} as const;

const mockExtractAccessToken = vi.fn();
const mockVerifyAccessToken = vi.fn();

vi.mock("../guards/access-token.ts", () => ({
  extractAccessToken: () => mockExtractAccessToken(),
  verifyAccessToken: () => mockVerifyAccessToken(),
}));

function makeMockRequest(overrides: { headers?: Record<string, string>; path?: string } = {}) {
  return {
    headers: overrides.headers ?? {},
    path: overrides.path ?? "/api/v1/api/docs",
  } as unknown as Request;
}

function makeMockResponse() {
  const status = vi.fn(() => mockResponse);
  const json = vi.fn(() => mockResponse);
  const mockResponse = { status, json } as unknown as Response;
  return mockResponse;
}

function makeMockNext() {
  return vi.fn() as unknown as NextFunction;
}

describe("SwaggerAuthMiddleware", () => {
  let middleware: SwaggerAuthMiddleware;

  beforeEach(() => {
    vi.resetAllMocks();
    middleware = new SwaggerAuthMiddleware(
      new JwtService(),
      new ConfigService(),
    );
  });

  it("calls next() when a valid token is provided", async () => {
    mockExtractAccessToken.mockReturnValue("valid-token");
    mockVerifyAccessToken.mockResolvedValue(MOCK_JWT_PAYLOAD);

    const req = makeMockRequest({ path: "/api/v1/api/docs" });
    const res = makeMockResponse();
    const next = makeMockNext();

    middleware.use(req, res, next);

    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when no token is provided", async () => {
    mockExtractAccessToken.mockReturnValue(undefined);

    const req = makeMockRequest({ path: "/api/v1/api/docs" });
    const res = makeMockResponse();
    const next = makeMockNext();

    middleware.use(req, res, next);

    await new Promise((resolve) => setImmediate(resolve));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: "No token provided" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token verification fails", async () => {
    mockExtractAccessToken.mockReturnValue("invalid-token");
    mockVerifyAccessToken.mockRejectedValue(new Error("Invalid token"));

    const req = makeMockRequest({ path: "/api/v1/api/docs" });
    const res = makeMockResponse();
    const next = makeMockNext();

    middleware.use(req, res, next);

    await new Promise((resolve) => setImmediate(resolve));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: "Invalid or expired token" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("does not protect non-Swagger paths", async () => {
    mockExtractAccessToken.mockReturnValue("valid-token");
    mockVerifyAccessToken.mockResolvedValue(MOCK_JWT_PAYLOAD);

    const req = makeMockRequest({ path: "/api/v1/health" });
    const res = makeMockResponse();
    const next = makeMockNext();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockExtractAccessToken).not.toHaveBeenCalled();
  });

  it("protects all Swagger sub-paths", async () => {
    mockExtractAccessToken.mockReturnValue("valid-token");
    mockVerifyAccessToken.mockResolvedValue(MOCK_JWT_PAYLOAD);

    const paths = [
      "/api/v1/api/docs",
      "/api/v1/api/docs-json",
      "/api/v1/api/docs/swagger-ui-init.js",
    ];

    for (const path of paths) {
      vi.resetAllMocks();
      mockExtractAccessToken.mockReturnValue("valid-token");
      mockVerifyAccessToken.mockResolvedValue(MOCK_JWT_PAYLOAD);

      const req = makeMockRequest({ path });
      const res = makeMockResponse();
      const next = makeMockNext();

      middleware.use(req, res, next);

      await new Promise((resolve) => setImmediate(resolve));

      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects non-super-admin users when requireSuperAdmin is true", async () => {
    const superAdminMiddleware = new SwaggerAuthMiddleware(
      new JwtService(),
      new ConfigService(),
    );

    // Access the private field for test purposes
    (superAdminMiddleware as unknown as { requireSuperAdmin: boolean }).requireSuperAdmin = true;

    mockExtractAccessToken.mockReturnValue("reader-token");
    mockVerifyAccessToken.mockResolvedValue(MOCK_JWT_PAYLOAD);

    const req = makeMockRequest({ path: "/api/v1/api/docs" });
    const res = makeMockResponse();
    const next = makeMockNext();

    superAdminMiddleware.use(req, res, next);

    await new Promise((resolve) => setImmediate(resolve));

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: "Insufficient admin privileges" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("allows super_admin users when requireSuperAdmin is true", async () => {
    const superAdminMiddleware = new SwaggerAuthMiddleware(
      new JwtService(),
      new ConfigService(),
    );

    (superAdminMiddleware as unknown as { requireSuperAdmin: boolean }).requireSuperAdmin = true;

    mockExtractAccessToken.mockReturnValue("admin-token");
    mockVerifyAccessToken.mockResolvedValue(MOCK_SUPER_ADMIN_PAYLOAD);

    const req = makeMockRequest({ path: "/api/v1/api/docs" });
    const res = makeMockResponse();
    const next = makeMockNext();

    superAdminMiddleware.use(req, res, next);

    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
