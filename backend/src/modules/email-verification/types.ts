export type VerifyEmailDto = {
  token: string;
};

export type ResendVerificationDto = {
  email: string;
};

export type VerificationTokenResponse = {
  userId: string;
};
