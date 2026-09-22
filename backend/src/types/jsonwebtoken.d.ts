import 'jsonwebtoken';

declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number | undefined;
    notBefore?: string | number | undefined;
  }
}
