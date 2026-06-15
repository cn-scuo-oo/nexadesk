export interface WorkspaceFile {
  path: string;
  kind: "file" | "folder";
  changed: boolean;
}

export interface WorkspaceTreeEntry {
  name: string;
  path: string;
  kind: "file" | "folder";
  size?: number;
  modifiedAt?: string;
}

export interface WorkspaceListResult {
  root: string;
  path: string;
  entries: WorkspaceTreeEntry[];
  exists: boolean;
  error?: string;
}

export interface WorkspaceFilePreviewResult {
  root: string;
  path: string;
  name: string;
  content: string;
  size?: number;
  modifiedAt?: string;
  exists: boolean;
  truncated?: boolean;
  error?: string;
}

export type WorkspaceSearchMode = "name" | "content";

export interface WorkspaceSearchMatch {
  name: string;
  path: string;
  kind: "file" | "folder";
  size?: number;
  modifiedAt?: string;
  line?: number;
  preview?: string;
}

export interface WorkspaceSearchResult {
  root: string;
  path: string;
  query: string;
  mode: WorkspaceSearchMode;
  matches: WorkspaceSearchMatch[];
  searchedEntries: number;
  truncated?: boolean;
  error?: string;
}

export interface WorkspaceArtifact {
  id: string;
  sessionId: string;
  title: string;
  kind: "diff" | "file" | "report" | "command";
  path?: string;
  summary: string;
  createdAt: string;
  status: "draft" | "ready" | "applied";
}