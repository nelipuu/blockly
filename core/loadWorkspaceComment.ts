import type {Workspace} from './workspace.js';
import {WorkspaceSvg} from './workspace_svg.js';
import {WorkspaceComment} from './comments/workspace_comment.js';
import {RenderedWorkspaceComment} from './comments/rendered_workspace_comment.js';
import {Coordinate} from './utils/coordinate.js';
import {Size} from './utils/size.js';

/** Deserializes the given comment state into the given workspace. */
export function loadWorkspaceComment(
  elem: Element,
  workspace: Workspace,
): WorkspaceComment {
  const id = elem.getAttribute('id') ?? undefined;
  const comment = workspace.rendered
    ? new RenderedWorkspaceComment(workspace as WorkspaceSvg, id)
    : new WorkspaceComment(workspace, id);

  comment.setText(elem.textContent ?? '');

  let x = parseInt(elem.getAttribute('x') ?? '', 10);
  const y = parseInt(elem.getAttribute('y') ?? '', 10);
  if (!isNaN(x) && !isNaN(y)) {
    x = workspace.RTL ? workspace.getWidth() - x : x;
    comment.moveTo(new Coordinate(x, y));
  }

  const w = parseInt(elem.getAttribute('w') ?? '', 10);
  const h = parseInt(elem.getAttribute('h') ?? '', 10);
  if (!isNaN(w) && !isNaN(h)) comment.setSize(new Size(w, h));

  if (elem.getAttribute('collapsed') === 'true') comment.setCollapsed(true);
  if (elem.getAttribute('editable') === 'false') comment.setEditable(false);
  if (elem.getAttribute('movable') === 'false') comment.setMovable(false);
  if (elem.getAttribute('deletable') === 'false') comment.setDeletable(false);

  return comment;
}
