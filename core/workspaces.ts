import type {Workspace} from './workspace';
import type {WorkspaceSvg} from './workspace_svg';

/** Database of all workspaces. */
const WorkspaceDB_: Record<string, Workspace> = Object.create(null);

/**
 * Find the workspace with the specified ID.
 *
 * @param id ID of workspace to find.
 * @returns The sought after workspace or null if not found.
 */
export function getWorkspaceById(id: string): Workspace | null {
  return WorkspaceDB_[id] || null;
}

/**
 * Find all workspaces.
 *
 * @returns Array of workspaces.
 */
export function getAllWorkspaces(): Workspace[] {
  const workspaces: Workspace[] = [];
  for (const workspaceId in WorkspaceDB_) {
    workspaces.push(WorkspaceDB_[workspaceId]);
  }
  return workspaces;
}

/**
 * Register a workspace in the workspace db.
 *
 * @param workspace
 */
export function registerWorkspace(workspace: Workspace) {
  WorkspaceDB_[workspace.id] = workspace;
}

/**
 * Unregister a workspace from the workspace db.
 *
 * @param workspace
 */
export function unregisterWorkpace(workspace: Workspace) {
  delete WorkspaceDB_[workspace.id];
}
