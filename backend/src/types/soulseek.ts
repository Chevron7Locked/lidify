export interface SoulseekFile {
  filename: string;
  size: number;
  extension: string;
  attributes: SoulseekFileAttributes[];
  bitrate?: number;
  duration?: number;
  quality?: string;
}

export interface SoulseekFileAttributes {
  type: number;
  value: number;
}

export interface SoulseekSearchResult {
  username: string;
  token: number;
  files: SoulseekFile[];
  freeUploadSlots: number;
  uploadSpeed: number;
  queueLength: number;
  hasFreeUploadSlot: boolean;
}

export interface SoulseekPeerInfo {
  username: string;
  status: number;
  avgSpeed: number;
  downloadNum: number;
  files: number;
  dirs: number;
  slotsFree: number;
  countryCode?: string;
}

export interface SoulseekDownloadOptions {
  path: string;
  username: string;
  file: SoulseekFile;
}

export interface SoulseekConnectionOptions {
  username: string;
  password: string;
  server?: string;
  port?: number;
}

export interface SoulseekSearchOptions {
  query: string;
  timeout?: number;
  maxResults?: number;
}
