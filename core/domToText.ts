import * as utilsXml from './utils/xml.js';

/**
 * Converts a DOM structure into plain text.
 * Currently the text format is fairly ugly: all one line with no whitespace,
 * unless the DOM itself has whitespace built-in.
 *
 * @param dom A tree of XML nodes.
 * @returns Text representation.
 */
export function domToText(dom: Node): string {
  const text = utilsXml.domToText(dom);
  // Unpack self-closing tags.  These tags fail when embedded in HTML.
  // <block name="foo"/> -> <block name="foo"></block>
  return text.replace(/<(\w+)([^<]*)\/>/g, '<$1$2></$1>');
}
