export interface GoogleTokenResponse {
  access_token: string;
}

export interface GoogleUserResponse {
  sub: string;
  email: string;
  name: string;
}

export interface FacebookTokenResponse {
  access_token: string;
}

export interface FacebookUserResponse {
  id: string;
  email?: string;
  name: string;
}

export interface GithubTokenResponse {
  access_token: string;
}

export interface GithubUserResponse {
  id: string;
  email?: string;
  name?: string;
  login: string;
}

export interface AppleTokenResponse {
  id_token: string;
}

export interface TiktokTokenResponse {
  access_token: string;
}

export interface TiktokUserResponse {
  data: {
    user: {
      user_id?: string;
      open_id?: string;
      display_name?: string;
    };
  };
}
