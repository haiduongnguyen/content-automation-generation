export type StoredMedia = {
  key: string;
  absolutePath: string;
  sizeBytes: number;
  sha256: string;
};

export interface MediaStorage {
  resolve(key: string): string;
  exists(key: string): Promise<boolean>;
  ensureDirectory(key: string): Promise<string>;
  saveFile(sourcePath: string, key: string): Promise<StoredMedia>;
  delete(key: string): Promise<void>;
}
