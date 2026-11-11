export type UpdateEdition = 'installer' | 'portable';
export interface UpdateStatus {
  currentVersion: string;
  edition: UpdateEdition;
  phase: 'idle' | 'checking' | 'current' | 'available' | 'error';
  checkedAt: number | null;
  release?: { version: string };
  message?: string;
}
export interface UpdateAPI {
  status(): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  download(): Promise<void>;
  subscribe(listener: (status: UpdateStatus) => void): () => void;
}
