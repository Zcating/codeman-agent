export interface RawWorkspace {
  id: string;
  label: string;
  root_path: string;
  created_at: number;
}

export interface Workspace {
  id: string;
  label: string;
  rootPath: string;
  createdAt: number;
}

export function toWorkspace(row: RawWorkspace): Workspace {
  return {
    id: row.id,
    label: row.label,
    rootPath: row.root_path,
    createdAt: row.created_at,
  };
}
