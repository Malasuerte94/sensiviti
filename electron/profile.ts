import path from 'node:path';

/** Both distribution formats and development use this stable default profile. */
export function profileDirectory(appData: string, override?: string): string {
  return override ? path.resolve(override) : path.join(appData, 'Sensiviti');
}
