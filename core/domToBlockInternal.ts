import type {Block} from './block.js';
import type {BlockSvg} from './block_svg.js';
import type {Connection} from './connection.js';
import {MANUALLY_DISABLED} from './constants.js';
import {EventType} from './events/type.js';
import * as eventUtils from './events/utils.js';
import {IconType} from './icons/icon_types.js';
import * as dom from './utils/dom.js';
import {Size} from './utils/size.js';
import * as Variables from './variables.js';
import type {Workspace} from './workspace.js';
import {WorkspaceSvg} from './workspace_svg.js';
export {domToText} from './domToText';

/**
 * Decode an XML block tag and create a block (and possibly sub blocks) on the
 * workspace.
 *
 * This is defined internally so that it doesn't trigger an immediate render,
 * which we do want to happen for external calls.
 *
 * @param xmlBlock XML block element.
 * @param workspace The workspace.
 * @returns The root block created.
 * @internal
 */
export function domToBlockInternal(
	xmlBlock: Element,
	workspace: Workspace,
): Block {
	// Create top-level block.
	eventUtils.disable();
	const variablesBeforeCreation = workspace.getAllVariables();
	let topBlock;
	try {
		topBlock = domToBlockHeadless(xmlBlock, workspace);
		// Generate list of all blocks.
		if (workspace.rendered) {
			const topBlockSvg = topBlock as BlockSvg;
			const blocks = topBlock.getDescendants(false);
			topBlockSvg.setConnectionTracking(false);
			// Render each block.
			for (let i = blocks.length - 1; i >= 0; i--) {
				(blocks[i] as BlockSvg).initSvg();
			}
			for (let i = blocks.length - 1; i >= 0; i--) {
				(blocks[i] as BlockSvg).queueRender();
			}
			// Populating the connection database may be deferred until after the
			// blocks have rendered.
			setTimeout(function () {
				if (!topBlockSvg.disposed) {
					topBlockSvg.setConnectionTracking(true);
				}
			}, 1);
			// Allow the scrollbars to resize and move based on the new contents.
			// TODO(@picklesrus): #387. Remove when domToBlock avoids resizing.
			(workspace as WorkspaceSvg).resizeContents();
		} else {
			const blocks = topBlock.getDescendants(false);
			for (let i = blocks.length - 1; i >= 0; i--) {
				blocks[i].initModel();
			}
		}
	} finally {
		eventUtils.enable();
	}
	if (eventUtils.isEnabled()) {
		const newVariables = Variables.getAddedVariables(
			workspace,
			variablesBeforeCreation,
		);
		// Fire a VarCreate event for each (if any) new variable created.
		for (let i = 0; i < newVariables.length; i++) {
			const thisVariable = newVariables[i];
			eventUtils.fire(new (eventUtils.get(EventType.VAR_CREATE))(thisVariable));
		}
		// Block events come after var events, in case they refer to newly created
		// variables.
		eventUtils.fire(new (eventUtils.get(EventType.BLOCK_CREATE))(topBlock));
	}
	return topBlock;
}

/**
 * Decode an XML block tag and create a block (and possibly sub blocks) on the
 * workspace.
 *
 * @param xmlBlock XML block element.
 * @param workspace The workspace.
 * @param parentConnection The parent connection to connect this block to
 *     after instantiating.
 * @param connectedToParentNext Whether the provided parent connection is a next
 *     connection, rather than output or statement.
 * @returns The root block created.
 */
function domToBlockHeadless(
	xmlBlock: Element,
	workspace: Workspace,
	parentConnection?: Connection,
	connectedToParentNext?: boolean,
): Block {
	let block: Block | null = null;
	const prototypeName = xmlBlock.getAttribute('type');
	if (!prototypeName) {
		throw TypeError('Block type unspecified: ' + xmlBlock.outerHTML);
	}
	const id = xmlBlock.getAttribute('id') ?? undefined;
	block = workspace.newBlock(prototypeName, id);

	// Preprocess childNodes so tags can be processed in a consistent order.
	const xmlChildNameMap = mapSupportedXmlTags(xmlBlock);

	const shouldCallInitSvg = applyMutationTagNodes(
		xmlChildNameMap.mutation,
		block,
	);
	applyCommentTagNodes(xmlChildNameMap.comment, block);
	applyDataTagNodes(xmlChildNameMap.data, block);

	// Connect parent after processing mutation and before setting fields.
	if (parentConnection) {
		if (connectedToParentNext) {
			if (block.previousConnection) {
				parentConnection.connect(block.previousConnection);
			} else {
				throw TypeError('Next block does not have previous statement.');
			}
		} else {
			if (block.outputConnection) {
				parentConnection.connect(block.outputConnection);
			} else if (block.previousConnection) {
				parentConnection.connect(block.previousConnection);
			} else {
				throw TypeError(
					'Child block does not have output or previous statement.',
				);
			}
		}
	}

	applyFieldTagNodes(xmlChildNameMap.field, block);
	applyInputTagNodes(xmlChildNameMap.input, workspace, block, prototypeName);
	applyNextTagNodes(xmlChildNameMap.next, workspace, block);

	if (shouldCallInitSvg) {
		// This shouldn't even be called here
		// (ref: https://github.com/google/blockly/pull/4296#issuecomment-884226021
		// But the XML serializer/deserializer is iceboxed so I'm not going to fix
		// it.
		(block as BlockSvg).initSvg();
	}

	const inline = xmlBlock.getAttribute('inline');
	if (inline) {
		block.setInputsInline(inline === 'true');
	}
	const disabled = xmlBlock.getAttribute('disabled');
	if (disabled) {
		// Before May 2024 we just used 'disabled', with no reasons.
		// Contiune to support this syntax.
		block.setDisabledReason(
			disabled === 'true' || disabled === 'disabled',
			MANUALLY_DISABLED,
		);
	}
	const disabledReasons = xmlBlock.getAttribute('disabled-reasons');
	if (disabledReasons !== null) {
		for (const reason of disabledReasons.split(',')) {
			// Use decodeURIComponent to restore characters that were encoded in the
			// value, such as commas.
			block.setDisabledReason(true, decodeURIComponent(reason));
		}
	}
	const deletable = xmlBlock.getAttribute('deletable');
	if (deletable) {
		block.setDeletable(deletable === 'true');
	}
	const movable = xmlBlock.getAttribute('movable');
	if (movable) {
		block.setMovable(movable === 'true');
	}
	const editable = xmlBlock.getAttribute('editable');
	if (editable) {
		block.setEditable(editable === 'true');
	}
	const collapsed = xmlBlock.getAttribute('collapsed');
	if (collapsed) {
		block.setCollapsed(collapsed === 'true');
	}
	if (xmlBlock.nodeName.toLowerCase() === 'shadow') {
		// Ensure all children are also shadows.
		const children = block.getChildren(false);
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (!child.isShadow()) {
				throw TypeError('Shadow block not allowed non-shadow child.');
			}
		}

		block.setShadow(true);
	}
	return block;
}

/**
 * Creates a mapping of childNodes for each supported XML tag for the provided
 * xmlBlock. Logs a warning for any encountered unsupported tags.
 *
 * @param xmlBlock XML block element.
 * @returns The childNode map from nodeName to node.
 */
function mapSupportedXmlTags(xmlBlock: Element): childNodeTagMap {
	const childNodeMap = {
		mutation: new Array<Element>(),
		comment: new Array<Element>(),
		data: new Array<Element>(),
		field: new Array<Element>(),
		input: new Array<Element>(),
		next: new Array<Element>(),
	};
	for (let i = 0; i < xmlBlock.children.length; i++) {
		const xmlChild = xmlBlock.children[i];
		if (xmlChild.nodeType === dom.NodeType.TEXT_NODE) {
			// Ignore any text at the <block> level.  It's all whitespace anyway.
			continue;
		}
		switch (xmlChild.nodeName.toLowerCase()) {
			case 'mutation':
				childNodeMap.mutation.push(xmlChild);
				break;
			case 'comment':
				childNodeMap.comment.push(xmlChild);
				break;
			case 'data':
				childNodeMap.data.push(xmlChild);
				break;
			case 'title':
			// Titles were renamed to field in December 2013.
			// Fall through.
			case 'field':
				childNodeMap.field.push(xmlChild);
				break;
			case 'value':
			case 'statement':
				childNodeMap.input.push(xmlChild);
				break;
			case 'next':
				childNodeMap.next.push(xmlChild);
				break;
			default:
				// Unknown tag; ignore.  Same principle as HTML parsers.
				console.warn('Ignoring unknown tag: ' + xmlChild.nodeName);
		}
	}
	return childNodeMap;
}

/** A mapping of nodeName to node for child nodes of xmlBlock. */
interface childNodeTagMap {
	mutation: Element[];
	comment: Element[];
	data: Element[];
	field: Element[];
	input: Element[];
	next: Element[];
}

/**
 * Applies mutation tag child nodes to the given block.
 *
 * @param xmlChildren Child nodes.
 * @param block The block to apply the child nodes on.
 * @returns True if mutation may have added some elements that need
 *     initialization (requiring initSvg call).
 */
function applyMutationTagNodes(xmlChildren: Element[], block: Block): boolean {
	let shouldCallInitSvg = false;
	for (let i = 0; i < xmlChildren.length; i++) {
		const xmlChild = xmlChildren[i];
		// Custom data for an advanced block.
		if (block.domToMutation) {
			block.domToMutation(xmlChild);
			if ((block as BlockSvg).initSvg) {
				// Mutation may have added some elements that need initializing.
				shouldCallInitSvg = true;
			}
		}
	}
	return shouldCallInitSvg;
}

/**
 * Applies comment tag child nodes to the given block.
 *
 * @param xmlChildren Child nodes.
 * @param block The block to apply the child nodes on.
 */
function applyCommentTagNodes(xmlChildren: Element[], block: Block) {
	for (let i = 0; i < xmlChildren.length; i++) {
		const xmlChild = xmlChildren[i];
		const text = xmlChild.textContent;
		const pinned = xmlChild.getAttribute('pinned') === 'true';
		const width = parseInt(xmlChild.getAttribute('w') ?? '50', 10);
		const height = parseInt(xmlChild.getAttribute('h') ?? '50', 10);

		block.setCommentText(text);
		const comment = block.getIcon(IconType.COMMENT)!;
		if (!isNaN(width) && !isNaN(height)) {
			comment.setBubbleSize(new Size(width, height));
		}
		// Set the pinned state of the bubble.
		comment.setBubbleVisible(pinned);
		// Actually show the bubble after the block has been rendered.
		setTimeout(() => comment.setBubbleVisible(pinned), 1);
	}
}

/**
 * Applies data tag child nodes to the given block.
 *
 * @param xmlChildren Child nodes.
 * @param block The block to apply the child nodes on.
 */
function applyDataTagNodes(xmlChildren: Element[], block: Block) {
	for (let i = 0; i < xmlChildren.length; i++) {
		const xmlChild = xmlChildren[i];
		block.data = xmlChild.textContent;
	}
}

/**
 * Applies field tag child nodes to the given block.
 *
 * @param xmlChildren Child nodes.
 * @param block The block to apply the child nodes on.
 */
function applyFieldTagNodes(xmlChildren: Element[], block: Block) {
	for (let i = 0; i < xmlChildren.length; i++) {
		const xmlChild = xmlChildren[i];
		const nodeName = xmlChild.getAttribute('name');
		if (!nodeName) {
			console.warn(`Ignoring unnamed field in block ${block.type}`);
			continue;
		}
		domToField(block, nodeName, xmlChild);
	}
}

/**
 * Applies input child nodes (value or statement) to the given block.
 *
 * @param xmlChildren Child nodes.
 * @param workspace The workspace containing the given block.
 * @param block The block to apply the child nodes on.
 * @param prototypeName The prototype name of the block.
 */
function applyInputTagNodes(
	xmlChildren: Element[],
	workspace: Workspace,
	block: Block,
	prototypeName: string,
) {
	for (let i = 0; i < xmlChildren.length; i++) {
		const xmlChild = xmlChildren[i];
		const nodeName = xmlChild.getAttribute('name');
		const input = nodeName ? block.getInput(nodeName) : null;
		if (!input) {
			console.warn(
				'Ignoring non-existent input ' +
				nodeName +
				' in block ' +
				prototypeName,
			);
			break;
		}
		const childBlockInfo = findChildBlocks(xmlChild);
		if (childBlockInfo.childBlockElement) {
			if (!input.connection) {
				throw TypeError('Input connection does not exist.');
			}
			domToBlockHeadless(
				childBlockInfo.childBlockElement,
				workspace,
				input.connection,
				false,
			);
		}
		// Set shadow after so we don't create a shadow we delete immediately.
		if (childBlockInfo.childShadowElement) {
			input.connection?.setShadowDom(childBlockInfo.childShadowElement);
		}
	}
}

/**
 * Applies next child nodes to the given block.
 *
 * @param xmlChildren Child nodes.
 * @param workspace The workspace containing the given block.
 * @param block The block to apply the child nodes on.
 */
function applyNextTagNodes(
	xmlChildren: Element[],
	workspace: Workspace,
	block: Block,
) {
	for (let i = 0; i < xmlChildren.length; i++) {
		const xmlChild = xmlChildren[i];
		const childBlockInfo = findChildBlocks(xmlChild);
		if (childBlockInfo.childBlockElement) {
			if (!block.nextConnection) {
				throw TypeError('Next statement does not exist.');
			}
			// If there is more than one XML 'next' tag.
			if (block.nextConnection.isConnected()) {
				throw TypeError('Next statement is already connected.');
			}
			// Create child block.
			domToBlockHeadless(
				childBlockInfo.childBlockElement,
				workspace,
				block.nextConnection,
				true,
			);
		}
		// Set shadow after so we don't create a shadow we delete immediately.
		if (childBlockInfo.childShadowElement && block.nextConnection) {
			block.nextConnection.setShadowDom(childBlockInfo.childShadowElement);
		}
	}
}

/**
 * Decode an XML field tag and set the value of that field on the given block.
 *
 * @param block The block that is currently being deserialized.
 * @param fieldName The name of the field on the block.
 * @param xml The field tag to decode.
 */
function domToField(block: Block, fieldName: string, xml: Element) {
	const field = block.getField(fieldName);
	if (!field) {
		console.warn(
			'Ignoring non-existent field ' + fieldName + ' in block ' + block.type,
		);
		return;
	}
	field.fromXml(xml);
}

/**
 * Finds any enclosed blocks or shadows within this XML node.
 *
 * @param xmlNode The XML node to extract child block info from.
 * @returns Any found child block.
 */
function findChildBlocks(xmlNode: Element): {
	childBlockElement: Element | null;
	childShadowElement: Element | null;
} {
	let childBlockElement: Element | null = null;
	let childShadowElement: Element | null = null;
	for (let i = 0; i < xmlNode.childNodes.length; i++) {
		const xmlChild = xmlNode.childNodes[i];
		if (isElement(xmlChild)) {
			if (xmlChild.nodeName.toLowerCase() === 'block') {
				childBlockElement = xmlChild;
			} else if (xmlChild.nodeName.toLowerCase() === 'shadow') {
				childShadowElement = xmlChild;
			}
		}
	}
	return {childBlockElement, childShadowElement};
}

export function isElement(node: Node): node is Element {
	return node.nodeType === dom.NodeType.ELEMENT_NODE;
}
