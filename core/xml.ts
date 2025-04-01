/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Former goog.module ID: Blockly.Xml

import type {Block} from './block.js';
import {WorkspaceComment} from './comments/workspace_comment.js';
import {EventType} from './events/type.js';
import * as eventUtils from './events/utils.js';
import type {Field} from './field.js';
import {IconType} from './icons/icon_types.js';
import {inputTypes} from './inputs/input_types.js';
import * as renderManagement from './render_management.js';
import * as dom from './utils/dom.js';
import * as utilsXml from './utils/xml.js';
import type {VariableModel} from './variable_model.js';
import * as Variables from './variables.js';
import type {Workspace} from './workspace.js';
import {WorkspaceSvg} from './workspace_svg.js';
import {domToText} from './domToText';
export {domToText} from './domToText';
import {loadWorkspaceComment} from './loadWorkspaceComment';
export {loadWorkspaceComment} from './loadWorkspaceComment';
import {domToBlockInternal, isElement} from './domToBlockInternal';
import {AnyDuringMigration} from './any_aliases.js';
export {domToBlockInternal} from './domToBlockInternal';

/**
 * Encode a block tree as XML.
 *
 * @param workspace The workspace containing blocks.
 * @param skipId True if the encoder should skip the block IDs. False by
 *     default.
 * @returns XML DOM element.
 */
export function workspaceToDom(workspace: Workspace, skipId = false): Element {
  const treeXml = utilsXml.createElement('xml');
  const variablesElement = variablesToDom(
    Variables.allUsedVarModels(workspace),
  );
  if (variablesElement.hasChildNodes()) {
    treeXml.appendChild(variablesElement);
  }
  for (const comment of workspace.getTopComments()) {
    treeXml.appendChild(
      saveWorkspaceComment(comment as AnyDuringMigration, skipId),
    );
  }
  const blocks = workspace.getTopBlocks(true);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    treeXml.appendChild(blockToDomWithXY(block, skipId));
  }
  return treeXml;
}

/** Serializes the given workspace comment to XML. */
export function saveWorkspaceComment(
  comment: WorkspaceComment,
  skipId = false,
): Element {
  const elem = utilsXml.createElement('comment');
  if (!skipId) elem.setAttribute('id', comment.id);

  const workspace = comment.workspace;
  const loc = comment.getRelativeToSurfaceXY();
  loc.x = workspace.RTL ? workspace.getWidth() - loc.x : loc.x;
  elem.setAttribute('x', `${loc.x}`);
  elem.setAttribute('y', `${loc.y}`);
  elem.setAttribute('w', `${comment.getSize().width}`);
  elem.setAttribute('h', `${comment.getSize().height}`);

  if (comment.getText()) elem.textContent = comment.getText();
  if (comment.isCollapsed()) elem.setAttribute('collapsed', 'true');
  if (!comment.isOwnEditable()) elem.setAttribute('editable', 'false');
  if (!comment.isOwnMovable()) elem.setAttribute('movable', 'false');
  if (!comment.isOwnDeletable()) elem.setAttribute('deletable', 'false');

  return elem;
}

/**
 * Encode a list of variables as XML.
 *
 * @param variableList List of all variable models.
 * @returns Tree of XML elements.
 */
export function variablesToDom(variableList: VariableModel[]): Element {
  const variables = utilsXml.createElement('variables');
  for (let i = 0; i < variableList.length; i++) {
    const variable = variableList[i];
    const element = utilsXml.createElement('variable');
    element.appendChild(utilsXml.createTextNode(variable.name));
    if (variable.type) {
      element.setAttribute('type', variable.type);
    }
    element.id = variable.getId();
    variables.appendChild(element);
  }
  return variables;
}

/**
 * Encode a block subtree as XML with XY coordinates.
 *
 * @param block The root block to encode.
 * @param opt_noId True if the encoder should skip the block ID.
 * @returns Tree of XML elements or an empty document fragment if the block was
 *     an insertion marker.
 */
export function blockToDomWithXY(
  block: Block,
  opt_noId?: boolean,
): Element | DocumentFragment {
  if (block.isInsertionMarker()) {
    // Skip over insertion markers.
    block = block.getChildren(false)[0];
    if (!block) {
      // Disappears when appended.
      return new DocumentFragment();
    }
  }

  let width = 0; // Not used in LTR.
  if (block.workspace.RTL) {
    width = block.workspace.getWidth();
  }

  const element = blockToDom(block, opt_noId);
  if (isElement(element)) {
    const xy = block.getRelativeToSurfaceXY();
    element.setAttribute(
      'x',
      String(Math.round(block.workspace.RTL ? width - xy.x : xy.x)),
    );
    element.setAttribute('y', String(Math.round(xy.y)));
  }
  return element;
}

/**
 * Encode a field as XML.
 *
 * @param field The field to encode.
 * @returns XML element, or null if the field did not need to be serialized.
 */
function fieldToDom(field: Field): Element | null {
  if (field.isSerializable()) {
    const container = utilsXml.createElement('field');
    container.setAttribute('name', field.name || '');
    return field.toXml(container);
  }
  return null;
}

/**
 * Encode all of a block's fields as XML and attach them to the given tree of
 * XML elements.
 *
 * @param block A block with fields to be encoded.
 * @param element The XML element to which the field DOM should be attached.
 */
function allFieldsToDom(block: Block, element: Element) {
  for (let i = 0; i < block.inputList.length; i++) {
    const input = block.inputList[i];
    for (let j = 0; j < input.fieldRow.length; j++) {
      const field = input.fieldRow[j];
      const fieldDom = fieldToDom(field);
      if (fieldDom) {
        element.appendChild(fieldDom);
      }
    }
  }
}

/**
 * Encode a block subtree as XML.
 *
 * @param block The root block to encode.
 * @param opt_noId True if the encoder should skip the block ID.
 * @returns Tree of XML elements or an empty document fragment if the block was
 *     an insertion marker.
 */
export function blockToDom(
  block: Block,
  opt_noId?: boolean,
): Element | DocumentFragment {
  // Skip over insertion markers.
  if (block.isInsertionMarker()) {
    const child = block.getChildren(false)[0];
    if (child) {
      return blockToDom(child);
    } else {
      // Disappears when appended.
      return new DocumentFragment();
    }
  }

  const element = utilsXml.createElement(block.isShadow() ? 'shadow' : 'block');
  element.setAttribute('type', block.type);
  if (!opt_noId) {
    element.id = block.id;
  }
  if (block.mutationToDom) {
    // Custom data for an advanced block.
    const mutation = block.mutationToDom();
    if (mutation && (mutation.hasChildNodes() || mutation.hasAttributes())) {
      element.appendChild(mutation);
    }
  }

  allFieldsToDom(block, element);

  const commentText = block.getCommentText();
  if (commentText) {
    const comment = block.getIcon(IconType.COMMENT)!;
    const size = comment.getBubbleSize();
    const pinned = comment.bubbleIsVisible();

    const commentElement = utilsXml.createElement('comment');
    commentElement.appendChild(utilsXml.createTextNode(commentText));
    commentElement.setAttribute('pinned', `${pinned}`);
    commentElement.setAttribute('h', String(size.height));
    commentElement.setAttribute('w', String(size.width));

    element.appendChild(commentElement);
  }

  if (block.data) {
    const dataElement = utilsXml.createElement('data');
    dataElement.appendChild(utilsXml.createTextNode(block.data));
    element.appendChild(dataElement);
  }

  for (let i = 0; i < block.inputList.length; i++) {
    const input = block.inputList[i];
    let container: Element;
    let empty = true;
    if (input.type === inputTypes.DUMMY || input.type === inputTypes.END_ROW) {
      continue;
    } else {
      const childBlock = input.connection!.targetBlock();
      if (input.type === inputTypes.VALUE) {
        container = utilsXml.createElement('value');
      } else if (input.type === inputTypes.STATEMENT) {
        container = utilsXml.createElement('statement');
      }
      const childShadow = input.connection!.getShadowDom();
      if (childShadow && (!childBlock || !childBlock.isShadow())) {
        container!.appendChild(cloneShadow(childShadow, opt_noId));
      }
      if (childBlock) {
        const childElem = blockToDom(childBlock, opt_noId);
        if (childElem.nodeType === dom.NodeType.ELEMENT_NODE) {
          container!.appendChild(childElem);
          empty = false;
        }
      }
    }
    container!.setAttribute('name', input.name);
    if (!empty) {
      element.appendChild(container!);
    }
  }
  if (
    block.inputsInline !== undefined &&
    block.inputsInline !== block.inputsInlineDefault
  ) {
    element.setAttribute('inline', String(block.inputsInline));
  }
  if (block.isCollapsed()) {
    element.setAttribute('collapsed', 'true');
  }
  if (!block.isEnabled()) {
    // Set the value of the attribute to a comma-separated list of reasons.
    // Use encodeURIComponent to escape commas in the reasons so that they
    // won't be confused with separator commas.
    element.setAttribute(
      'disabled-reasons',
      Array.from(block.getDisabledReasons()).map(encodeURIComponent).join(','),
    );
  }
  if (!block.isOwnDeletable()) {
    element.setAttribute('deletable', 'false');
  }
  if (!block.isOwnMovable()) {
    element.setAttribute('movable', 'false');
  }
  if (!block.isOwnEditable()) {
    element.setAttribute('editable', 'false');
  }

  const nextBlock = block.getNextBlock();
  let container: Element;
  if (nextBlock) {
    const nextElem = blockToDom(nextBlock, opt_noId);
    if (nextElem.nodeType === dom.NodeType.ELEMENT_NODE) {
      container = utilsXml.createElement('next');
      container.appendChild(nextElem);
      element.appendChild(container);
    }
  }
  const nextShadow =
    block.nextConnection && block.nextConnection.getShadowDom();
  if (nextShadow && (!nextBlock || !nextBlock.isShadow())) {
    container!.appendChild(cloneShadow(nextShadow, opt_noId));
  }

  return element;
}

/**
 * Deeply clone the shadow's DOM so that changes don't back-wash to the block.
 *
 * @param shadow A tree of XML elements.
 * @param opt_noId True if the encoder should skip the block ID.
 * @returns A tree of XML elements.
 */
function cloneShadow(shadow: Element, opt_noId?: boolean): Element {
  shadow = shadow.cloneNode(true) as Element;
  // Walk the tree looking for whitespace.  Don't prune whitespace in a tag.
  let node: Node | null = shadow;
  let textNode;
  while (node) {
    if (opt_noId && node.nodeName === 'shadow') {
      // Strip off IDs from shadow blocks.  There should never be a 'block' as
      // a child of a 'shadow', so no need to check that.
      (node as Element).removeAttribute('id');
    }
    if (node.firstChild) {
      node = node.firstChild;
    } else {
      while (node && !node.nextSibling) {
        textNode = node;
        node = node.parentNode;
        if (
          textNode.nodeType === dom.NodeType.TEXT_NODE &&
          (textNode as Text).data.trim() === '' &&
          node?.firstChild !== textNode
        ) {
          // Prune whitespace after a tag.
          dom.removeNode(textNode);
        }
      }
      if (node) {
        textNode = node;
        node = node.nextSibling;
        if (
          textNode.nodeType === dom.NodeType.TEXT_NODE &&
          (textNode as Text).data.trim() === ''
        ) {
          // Prune whitespace before a tag.
          dom.removeNode(textNode);
        }
      }
    }
  }
  return shadow;
}

/**
 * Converts a DOM structure into properly indented text.
 *
 * @param dom A tree of XML elements.
 * @returns Text representation.
 */
export function domToPrettyText(dom: Node): string {
  // This function is not guaranteed to be correct for all XML.
  // But it handles the XML that Blockly generates.
  const blob = domToText(dom);
  // Place every open and close tag on its own line.
  const lines = blob.split('<');
  // Indent every line.
  let indent = '';
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line[0] === '/') {
      indent = indent.substring(2);
    }
    lines[i] = indent + '<' + line;
    if (line[0] !== '/' && line.slice(-2) !== '/>') {
      indent += '  ';
    }
  }
  // Pull simple tags back together.
  // E.g. <foo></foo>
  let text = lines.join('\n');
  text = text.replace(/(<(\w+)\b[^>]*>[^\n]*)\n *<\/\2>/g, '$1</$2>');
  // Trim leading blank line.
  return text.replace(/^\n/, '');
}

/**
 * Clear the given workspace then decode an XML DOM and
 * create blocks on the workspace.
 *
 * @param xml XML DOM.
 * @param workspace The workspace.
 * @returns An array containing new block IDs.
 */
export function clearWorkspaceAndLoadFromXml(
  xml: Element,
  workspace: WorkspaceSvg,
): string[] {
  workspace.setResizesEnabled(false);
  workspace.clear();
  const blockIds = domToWorkspace(xml, workspace);
  workspace.setResizesEnabled(true);
  return blockIds;
}

/**
 * Decode an XML DOM and create blocks on the workspace.
 *
 * @param xml XML DOM.
 * @param workspace The workspace.
 * @returns An array containing new block IDs.
 */
export function domToWorkspace(xml: Element, workspace: Workspace): string[] {
  let width = 0; // Not used in LTR.
  if (workspace.RTL) {
    width = workspace.getWidth();
  }
  const newBlockIds = []; // A list of block IDs added by this call.
  dom.startTextWidthCache();
  const existingGroup = eventUtils.getGroup();
  if (!existingGroup) {
    eventUtils.setGroup(true);
  }

  // Disable workspace resizes as an optimization.
  // Assume it is rendered so we can check.
  if ((workspace as WorkspaceSvg).setResizesEnabled) {
    (workspace as WorkspaceSvg).setResizesEnabled(false);
  }
  let variablesFirst = true;
  try {
    for (let i = 0, xmlChild; (xmlChild = xml.childNodes[i]); i++) {
      const name = xmlChild.nodeName.toLowerCase();
      const xmlChildElement = xmlChild as Element;
      if (
        name === 'block' ||
        (name === 'shadow' && !eventUtils.getRecordUndo())
      ) {
        // Allow top-level shadow blocks if recordUndo is disabled since
        // that means an undo is in progress.  Such a block is expected
        // to be moved to a nested destination in the next operation.
        const block = domToBlockInternal(xmlChildElement, workspace);
        newBlockIds.push(block.id);
        const blockX = parseInt(xmlChildElement.getAttribute('x') ?? '10', 10);
        const blockY = parseInt(xmlChildElement.getAttribute('y') ?? '10', 10);
        if (!isNaN(blockX) && !isNaN(blockY)) {
          block.moveBy(workspace.RTL ? width - blockX : blockX, blockY, [
            'create',
          ]);
        }
        variablesFirst = false;
      } else if (name === 'shadow') {
        throw TypeError('Shadow block cannot be a top-level block.');
      } else if (name === 'comment') {
        loadWorkspaceComment(xmlChildElement, workspace);
      } else if (name === 'variables') {
        if (variablesFirst) {
          domToVariables(xmlChildElement, workspace);
        } else {
          throw Error(
            "'variables' tag must exist once before block and " +
            'shadow tag elements in the workspace XML, but it was found in ' +
            'another location.',
          );
        }
        variablesFirst = false;
      }
    }
  } finally {
    eventUtils.setGroup(existingGroup);
    if ((workspace as WorkspaceSvg).setResizesEnabled) {
      (workspace as WorkspaceSvg).setResizesEnabled(true);
    }
    if (workspace.rendered) renderManagement.triggerQueuedRenders();
    dom.stopTextWidthCache();
  }
  // Re-enable workspace resizing.
  eventUtils.fire(new (eventUtils.get(EventType.FINISHED_LOADING))(workspace));
  return newBlockIds;
}

/**
 * Decode an XML DOM and create blocks on the workspace. Position the new
 * blocks immediately below prior blocks, aligned by their starting edge.
 *
 * @param xml The XML DOM.
 * @param workspace The workspace to add to.
 * @returns An array containing new block IDs.
 */
export function appendDomToWorkspace(
  xml: Element,
  workspace: WorkspaceSvg,
): string[] {
  // First check if we have a WorkspaceSvg, otherwise the blocks have no shape
  // and the position does not matter.
  // Assume it is rendered so we can check.
  if (!(workspace as WorkspaceSvg).getBlocksBoundingBox) {
    return domToWorkspace(xml, workspace);
  }

  const bbox = (workspace as WorkspaceSvg).getBlocksBoundingBox();
  // Load the new blocks into the workspace and get the IDs of the new blocks.
  const newBlockIds = domToWorkspace(xml, workspace);
  if (bbox && bbox.top !== bbox.bottom) {
    // Check if any previous block.
    let offsetY = 0; // Offset to add to y of the new block.
    let offsetX = 0;
    const farY = bbox.bottom; // Bottom position.
    const topX = workspace.RTL ? bbox.right : bbox.left; // X of bounding box.
    // Check position of the new blocks.
    let newLeftX = Infinity; // X of top left corner.
    let newRightX = -Infinity; // X of top right corner.
    let newY = Infinity; // Y of top corner.
    const ySeparation = 10;
    for (let i = 0; i < newBlockIds.length; i++) {
      const blockXY = workspace
        .getBlockById(newBlockIds[i])!
        .getRelativeToSurfaceXY();
      if (blockXY.y < newY) {
        newY = blockXY.y;
      }
      if (blockXY.x < newLeftX) {
        // if we left align also on x
        newLeftX = blockXY.x;
      }
      if (blockXY.x > newRightX) {
        // if we right align also on x
        newRightX = blockXY.x;
      }
    }
    offsetY = farY - newY + ySeparation;
    offsetX = workspace.RTL ? topX - newRightX : topX - newLeftX;
    for (let i = 0; i < newBlockIds.length; i++) {
      const block = workspace.getBlockById(newBlockIds[i]);
      block!.moveBy(offsetX, offsetY, ['create']);
    }
  }
  return newBlockIds;
}

/**
 * Decode an XML block tag and create a block (and possibly sub blocks) on the
 * workspace.
 *
 * @param xmlBlock XML block element.
 * @param workspace The workspace.
 * @returns The root block created.
 */
export function domToBlock(xmlBlock: Element, workspace: Workspace): Block {
  const block = domToBlockInternal(xmlBlock, workspace);
  if (workspace.rendered) renderManagement.triggerQueuedRenders();
  return block;
}

/**
 * Decode an XML list of variables and add the variables to the workspace.
 *
 * @param xmlVariables List of XML variable elements.
 * @param workspace The workspace to which the variable should be added.
 */
export function domToVariables(xmlVariables: Element, workspace: Workspace) {
  for (let i = 0; i < xmlVariables.children.length; i++) {
    const xmlChild = xmlVariables.children[i];
    const type = xmlChild.getAttribute('type');
    const id = xmlChild.getAttribute('id');
    const name = xmlChild.textContent;

    if (!name) return;
    workspace.createVariable(name, type, id);
  }
}

/**
 * Remove any 'next' block (statements in a stack).
 *
 * @param xmlBlock XML block element or an empty DocumentFragment if the block
 *     was an insertion marker.
 */
export function deleteNext(xmlBlock: Element | DocumentFragment) {
  for (let i = 0; i < xmlBlock.childNodes.length; i++) {
    const child = xmlBlock.childNodes[i];
    if (child.nodeName.toLowerCase() === 'next') {
      xmlBlock.removeChild(child);
      break;
    }
  }
}
