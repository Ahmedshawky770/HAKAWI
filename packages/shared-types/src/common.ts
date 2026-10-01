export type Exact<Expected, Actual> = (<T>() => T extends Expected ? 1 : 2) extends <T>() => T extends Actual ? 1 : 2
  ? true
  : false;

export type AuthorSummary = {
  id: string;
  name: string | null;
};

export type ApiErrorDetail = {
  field: string;
  message: string;
};

export type ApiError = {
  statusCode: number;
  error: string;
  message: string;
  details?: ApiErrorDetail[];
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export type NamedPaginated<Key extends string, T> = Omit<Paginated<T>, 'items'> & { [K in Key]: T[] };

export type NamedPage<Key extends string, T> = { [K in Key]: T[] } & { total: number; page: number; limit: number };

export type NamedTotal<Key extends string, T> = { [K in Key]: T[] } & { total: number };

export type CountResult = {
  count: number;
};

export type MessageOnly = {
  message: string;
};

export const toSet = <const Values extends readonly string[]>(values: Values): ReadonlySet<string> => new Set<string>(values);

export const isOneOf = <const Values extends readonly string[]>(
  values: Values,
  candidate: string,
): candidate is Values[number] => values.includes(candidate);
