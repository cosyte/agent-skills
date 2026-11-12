// A small XML reader for channel exports, hardened for untrusted input. Node's standard library
// only. It reads the input as it streams in and builds a tree of elements.
//
// What it refuses, each with a stable code and the line, never any of the input's text:
//   XML_DOCTYPE_REFUSED   any <!DOCTYPE ...> or other markup declaration, so no entity can be
//                         declared, no external entity can be fetched and nothing can expand
//   XML_ENTITY_REFUSED    an entity reference other than the five XML predefines, or a
//                         character reference to a character XML does not allow
//   XML_ENCODING_REFUSED  an encoding other than UTF-8, or bytes that are not UTF-8
//   XML_LIMIT_*           input past a limit: SIZE, DEPTH, ELEMENTS, ATTRIBUTES, NAME, TEXT, REFS
//   XML_MALFORMED         anything that is not well-formed
//
// The only expansion is a predefined or character reference, one character each, and the number of
// references is capped, so the output can never be larger than the input.

export const DEFAULT_LIMITS = Object.freeze({
  maxInputChars: 64 * 1024 * 1024,
  maxDepth: 128,
  maxElements: 500_000,
  maxAttributes: 64,
  maxNameChars: 256,
  maxTextChars: 16 * 1024 * 1024,
  maxEntityRefs: 1_000_000,
});

export class XmlRefused extends Error {
  constructor(code, line, detail) {
    super(`${code} at line ${line}: ${detail}`);
    this.name = "XmlRefused";
    this.code = code;
    this.line = line;
  }
}

const PREDEFINED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const NAME_RE = /^[A-Za-z_:À-￿][A-Za-z0-9._:·À-￿-]*$/u;
const ATTR_RE = /\s*([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

function allowedChar(cp) {
  return (
    cp === 0x9 || cp === 0xa || cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

function countNewlines(text, from, to) {
  let n = 0;
  for (let i = from; i < to; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

export class XmlReader {
  constructor(limits = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.buf = "";
    this.pos = 0;
    this.line = 1;
    this.total = 0;
    this.stack = [];
    this.root = null;
    this.rootClosed = false;
    this.elements = 0;
    this.refs = 0;
    this.started = false;
    this.tokens = 0;
  }

  refuse(code, detail, line = this.line) {
    throw new XmlRefused(code, line, detail);
  }

  push(chunk) {
    if (chunk.length === 0) return;
    if (!this.started) {
      this.started = true;
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
    }
    this.total += chunk.length;
    if (this.total > this.limits.maxInputChars) this.refuse("XML_LIMIT_SIZE", `input is over ${this.limits.maxInputChars} characters`);
    this.buf = this.buf.slice(this.pos) + chunk;
    this.pos = 0;
    this.drain(false);
  }

  end() {
    this.buf = this.buf.slice(this.pos);
    this.pos = 0;
    this.drain(true);
    if (this.pos < this.buf.length) this.refuse("XML_MALFORMED", "the input ends inside markup");
    if (this.root === null) this.refuse("XML_MALFORMED", "there is no root element");
    if (this.stack.length > 0) this.refuse("XML_MALFORMED", `element ${this.stack.length} level(s) deep is never closed`);
    return this.root;
  }

  advance(to) {
    this.tokens += 1;
    this.line += countNewlines(this.buf, this.pos, to);
    this.pos = to;
  }

  drain(final) {
    const buf = this.buf;
    while (this.pos < buf.length) {
      const pos = this.pos;
      if (buf[pos] !== "<") {
        let next = buf.indexOf("<", pos);
        if (next === -1) {
          if (!final) {
            if (buf.length - pos > this.limits.maxTextChars) this.refuse("XML_LIMIT_TEXT", `text is over ${this.limits.maxTextChars} characters`);
            return;
          }
          next = buf.length;
        }
        this.text(buf.slice(pos, next), this.line);
        this.advance(next);
        continue;
      }
      const rest = buf.length - pos;
      if (buf.startsWith("<?", pos)) {
        const close = buf.indexOf("?>", pos + 2);
        if (close === -1) {
          if (rest > 4096 && !final) this.refuse("XML_MALFORMED", "a processing instruction is too long");
          return;
        }
        this.instruction(buf.slice(pos + 2, close));
        this.advance(close + 2);
        continue;
      }
      if (buf.startsWith("<!", pos)) {
        if (rest < 9 && !final && ("<!--".startsWith(buf.slice(pos, pos + 4)) || "<![CDATA[".startsWith(buf.slice(pos)))) return;
        if (buf.startsWith("<!--", pos)) {
          const close = buf.indexOf("-->", pos + 4);
          if (close === -1) {
            if (rest > this.limits.maxTextChars && !final) this.refuse("XML_LIMIT_TEXT", "a comment is too long");
            if (final) this.refuse("XML_MALFORMED", "a comment is never closed");
            return;
          }
          this.advance(close + 3);
          continue;
        }
        if (buf.startsWith("<![CDATA[", pos)) {
          if (this.stack.length === 0) this.refuse("XML_MALFORMED", "a CDATA section outside the root element");
          const close = buf.indexOf("]]>", pos + 9);
          if (close === -1) {
            if (rest > this.limits.maxTextChars && !final) this.refuse("XML_LIMIT_TEXT", "a CDATA section is too long");
            if (final) this.refuse("XML_MALFORMED", "a CDATA section is never closed");
            return;
          }
          this.appendText(buf.slice(pos + 9, close), this.line);
          this.advance(close + 3);
          continue;
        }
        this.refuse("XML_DOCTYPE_REFUSED", "a document type or markup declaration is not accepted");
      }
      // A start or end tag: find its closing ">" outside quoted values.
      let quote = null;
      let close = -1;
      for (let i = pos + 1; i < buf.length; i += 1) {
        const c = buf[i];
        if (quote !== null) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") {
          close = i;
          break;
        } else if (c === "<") this.refuse("XML_MALFORMED", "a tag holds a <", this.line + countNewlines(buf, pos, i));
      }
      if (close === -1) {
        if (rest > 1024 * 1024) this.refuse("XML_LIMIT_SIZE", "a tag is over 1048576 characters");
        if (final) this.refuse("XML_MALFORMED", "a tag is never closed");
        return;
      }
      const startLine = this.line;
      const inner = buf.slice(pos + 1, close);
      if (inner.startsWith("/")) this.closeTag(inner.slice(1).trim(), startLine);
      else this.openTag(inner, startLine);
      this.advance(close + 1);
    }
  }

  instruction(body) {
    const target = /^\S*/.exec(body)[0];
    if (target.toLowerCase() !== "xml") return;
    if (this.tokens > 0) this.refuse("XML_MALFORMED", "an XML declaration after the start");
    const enc = /\bencoding\s*=\s*["']([^"']*)["']/.exec(body);
    if (enc !== null && !/^utf-?8$/i.test(enc[1])) this.refuse("XML_ENCODING_REFUSED", "the declared encoding is not UTF-8");
  }

  name(raw, line) {
    if (raw.length > this.limits.maxNameChars) this.refuse("XML_LIMIT_NAME", `a name is over ${this.limits.maxNameChars} characters`, line);
    if (!NAME_RE.test(raw)) this.refuse("XML_MALFORMED", "a tag or attribute name is not a valid XML name", line);
    return raw;
  }

  decode(raw, line) {
    if (!raw.includes("&")) return raw;
    let out = "";
    let i = 0;
    while (i < raw.length) {
      const amp = raw.indexOf("&", i);
      if (amp === -1) {
        out += raw.slice(i);
        break;
      }
      out += raw.slice(i, amp);
      const semi = raw.indexOf(";", amp);
      if (semi === -1 || semi - amp > 12) this.refuse("XML_MALFORMED", "an & that starts no reference", line);
      const ref = raw.slice(amp + 1, semi);
      this.refs += 1;
      if (this.refs > this.limits.maxEntityRefs) this.refuse("XML_LIMIT_REFS", `over ${this.limits.maxEntityRefs} references`, line);
      if (ref.startsWith("#")) {
        const cp = /^#x[0-9a-fA-F]{1,6}$/.test(ref) ? Number.parseInt(ref.slice(2), 16)
          : /^#[0-9]{1,7}$/.test(ref) ? Number.parseInt(ref.slice(1), 10) : -1;
        if (!allowedChar(cp)) this.refuse("XML_ENTITY_REFUSED", "a character reference to a character XML does not allow", line);
        out += String.fromCodePoint(cp);
      } else if (Object.hasOwn(PREDEFINED, ref)) {
        out += PREDEFINED[ref];
      } else {
        this.refuse("XML_ENTITY_REFUSED", "an entity reference that is not one of the five XML predefines", line);
      }
      i = semi + 1;
    }
    return out;
  }

  openTag(inner, line) {
    if (this.rootClosed) this.refuse("XML_MALFORMED", "a second root element", line);
    const selfClosing = inner.endsWith("/");
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const nameMatch = /^[^\s/>]+/.exec(body);
    if (nameMatch === null) this.refuse("XML_MALFORMED", "a tag with no name", line);
    const name = this.name(nameMatch[0], line);
    const attrs = Object.create(null);
    let count = 0;
    ATTR_RE.lastIndex = nameMatch[0].length;
    let at = ATTR_RE.lastIndex;
    for (;;) {
      ATTR_RE.lastIndex = at;
      const m = ATTR_RE.exec(body);
      if (m === null) break;
      count += 1;
      if (count > this.limits.maxAttributes) this.refuse("XML_LIMIT_ATTRIBUTES", `over ${this.limits.maxAttributes} attributes on one element`, line);
      const key = this.name(m[1], line);
      if (Object.hasOwn(attrs, key)) this.refuse("XML_MALFORMED", "an attribute given twice", line);
      const value = m[2] ?? m[3];
      if (value.includes("<")) this.refuse("XML_MALFORMED", "an attribute value holds a <", line);
      attrs[key] = this.decode(value, line);
      at = ATTR_RE.lastIndex;
    }
    if (body.slice(at).trim() !== "") this.refuse("XML_MALFORMED", "a tag holds text that is not an attribute", line);
    this.elements += 1;
    if (this.elements > this.limits.maxElements) this.refuse("XML_LIMIT_ELEMENTS", `over ${this.limits.maxElements} elements`, line);
    const node = { name, attrs, children: [], text: "", line, textLine: null };
    if (this.stack.length === 0) {
      if (this.root !== null) this.refuse("XML_MALFORMED", "a second root element", line);
      this.root = node;
    } else {
      this.stack[this.stack.length - 1].children.push(node);
    }
    if (selfClosing) {
      if (this.stack.length === 0) this.rootClosed = true;
      return;
    }
    this.stack.push(node);
    if (this.stack.length > this.limits.maxDepth) this.refuse("XML_LIMIT_DEPTH", `nesting is over ${this.limits.maxDepth} levels`, line);
  }

  closeTag(name, line) {
    const top = this.stack.pop();
    if (top === undefined || top.name !== name) this.refuse("XML_MALFORMED", "an end tag that does not match the open element", line);
    if (this.stack.length === 0) this.rootClosed = true;
  }

  text(raw, line) {
    if (this.stack.length === 0) {
      if (raw.trim() !== "") this.refuse("XML_MALFORMED", "text outside the root element", line);
      return;
    }
    this.appendText(this.decode(raw, line), line);
  }

  appendText(text, line) {
    const node = this.stack[this.stack.length - 1];
    if (node.textLine === null) node.textLine = line;
    if (node.text.length + text.length > this.limits.maxTextChars) this.refuse("XML_LIMIT_TEXT", `text is over ${this.limits.maxTextChars} characters`, line);
    node.text += text;
  }
}

export function parseXmlString(text, limits = {}) {
  const reader = new XmlReader(limits);
  reader.push(text);
  return reader.end();
}

// Reads a stream of bytes (a file stream, say) as UTF-8 and parses it as it arrives.
export async function parseXmlStream(stream, limits = {}) {
  const reader = new XmlReader(limits);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for await (const chunk of stream) reader.push(decoder.decode(chunk, { stream: true }));
    reader.push(decoder.decode());
  } catch (err) {
    if (err instanceof XmlRefused) throw err;
    if (err instanceof TypeError) throw new XmlRefused("XML_ENCODING_REFUSED", reader.line, "the bytes are not UTF-8");
    throw err;
  }
  return reader.end();
}

// Helpers for reading the tree.
export function child(node, name) {
  return node?.children.find((c) => c.name === name);
}

export function children(node, name) {
  return node === undefined ? [] : node.children.filter((c) => c.name === name);
}

export function textOf(node, name) {
  const c = child(node, name);
  return c === undefined ? undefined : c.text;
}

export function descendant(node, name) {
  if (node === undefined) return undefined;
  for (const c of node.children) {
    if (c.name === name) return c;
    const d = descendant(c, name);
    if (d !== undefined) return d;
  }
  return undefined;
}
