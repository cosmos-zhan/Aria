export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    const detail = body.detail;
    throw new ApiError(
      response.status,
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((x: { loc: string[]; msg: string }) => `${x.loc.slice(1).join('.')}: ${x.msg}`)
              .join('；')
          : JSON.stringify(detail),
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const remove = (path: string) => api<void>(path, { method: 'DELETE' });
