export type ApiSuccess<T> = { code: 0; data: T; message?: string };
export type ApiFail = { code: number; data: null; message: string };

export function ok<T>(data: T): ApiSuccess<T> {
  return { code: 0, data };
}

export function fail(code: number, message: string): ApiFail {
  return { code, data: null, message };
}
