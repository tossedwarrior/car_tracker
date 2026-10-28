export interface ConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: object;
}
export function connectionOptions(env?: Record<string, string | undefined>): ConnectionOptions;
export function describe(options: ConnectionOptions): string;
export function toUrl(options: ConnectionOptions): string;
