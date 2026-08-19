export type PendingUpload = {
  projectId: string;
  file: File;
};

let pending: PendingUpload | null = null;

export function setPendingUpload(projectId: string, file: File) {
  pending = { projectId, file };
}

export function takePendingUpload(projectId: string) {
  if (!pending || pending.projectId !== projectId) return null;
  const file = pending.file;
  pending = null;
  return file;
}

export function clearPendingUpload(projectId?: string) {
  if (!pending) return;
  if (projectId && pending.projectId !== projectId) return;
  pending = null;
}
