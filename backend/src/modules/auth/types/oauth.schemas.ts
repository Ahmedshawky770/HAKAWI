import { z } from 'zod';

export const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

export const googleUserResponseSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1).optional(),
  email_verified: z.boolean().optional(),
  name: z.string().nullish(),
  picture: z.string().nullish(),
});

export const facebookTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

export const facebookUserResponseSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullish(),
  name: z.string().nullish(),
});

export const githubTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

export const githubUserResponseSchema = z.object({
  id: z.number(),
  login: z.string().min(1),
  email: z.string().nullish(),
  name: z.string().nullish(),
  avatar_url: z.string().nullish(),
});

export const appleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

export const tiktokTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
  open_id: z.string().optional(),
  scope: z.string().optional(),
  message: z.string().optional(),
});

export const tiktokUserResponseSchema = z.object({
  code: z.number().int(),
  message: z.string().optional(),
  data: z
    .object({
      user: z
        .object({
          user_id: z.string().nullish(),
          open_id: z.string().nullish(),
          display_name: z.string().nullish(),
          avatar_url: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

export type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;
export type GoogleUserResponse = z.infer<typeof googleUserResponseSchema>;
export type FacebookTokenResponse = z.infer<typeof facebookTokenResponseSchema>;
export type FacebookUserResponse = z.infer<typeof facebookUserResponseSchema>;
export type GithubTokenResponse = z.infer<typeof githubTokenResponseSchema>;
export type GithubUserResponse = z.infer<typeof githubUserResponseSchema>;
export type AppleTokenResponse = z.infer<typeof appleTokenResponseSchema>;
export type TiktokTokenResponse = z.infer<typeof tiktokTokenResponseSchema>;
export type TiktokUserResponse = z.infer<typeof tiktokUserResponseSchema>;

export interface OAuthProfile {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly username?: string;
}
