// Tests for the hardened XML reader. Synthetic input only. Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseXmlString, parseXmlStream, XmlRefused } from "../scripts/xml.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "synth-adt-feed.xml");

function refusedWith(code, fn) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof XmlRefused, `expected XmlRefused, got ${err?.name}`);
    assert.equal(err.code, code);
    return true;
  });
}

const child = (node, name) => node.children.find((c) => c.name === name);

test("reads the synthetic export into a tree", () => {
  const root = parseXmlString(readFileSync(fixture, "utf8"));
  assert.equal(root.name, "channel");
  assert.equal(root.attrs.version, "9.9.0");
  assert.equal(child(root, "name").text, "Synth ADT Feed");
  const dests = child(root, "destinationConnectors");
  assert.equal(dests.children.length, 3);
});

test("streams a file in chunks and gets the same tree", async () => {
  const whole = parseXmlString(readFileSync(fixture, "utf8"));
  const streamed = await parseXmlStream(createReadStream(fixture, { highWaterMark: 7 }));
  assert.deepEqual(streamed, whole);
});

test("decodes the five predefined entities, character references and CDATA", () => {
  const root = parseXmlString("<a x=\"&quot;&apos;\">&lt;b&gt; &amp; &#65;&#x42;<![CDATA[<raw & text>]]></a>");
  assert.equal(root.attrs.x, "\"'");
  assert.equal(root.text, "<b> & AB<raw & text>");
});

test("records the line each element's text starts on", () => {
  const root = parseXmlString("<a>\n<b>one</b>\n<c>\ntwo</c></a>");
  assert.equal(child(root, "b").textLine, 2);
  assert.equal(child(root, "c").textLine, 3);
});

test("refuses a DOCTYPE, so no entity can be declared or expanded", () => {
  refusedWith("XML_DOCTYPE_REFUSED", () =>
    parseXmlString('<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>'),
  );
});

test("refuses an exponential entity expansion before any expansion", () => {
  const laughs = [
    '<?xml version="1.0"?>',
    "<!DOCTYPE lolz [",
    '<!ENTITY lol "lol">',
    '<!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">',
    '<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">',
    "]>",
    "<lolz>&lol3;</lolz>",
  ].join("\n");
  refusedWith("XML_DOCTYPE_REFUSED", () => parseXmlString(laughs));
});

test("refuses an external entity declared by SYSTEM", () => {
  refusedWith("XML_DOCTYPE_REFUSED", () =>
    parseXmlString('<!DOCTYPE a [<!ENTITY ext SYSTEM "file:///etc/hostname">]><a>&ext;</a>'),
  );
});

test("refuses a reference to an entity that is not predefined", () => {
  refusedWith("XML_ENTITY_REFUSED", () => parseXmlString("<a>&ext;</a>"));
});

test("refuses a character reference to a character XML forbids", () => {
  refusedWith("XML_ENTITY_REFUSED", () => parseXmlString("<a>&#0;</a>"));
});

test("refuses nesting deeper than the limit", () => {
  const deep = "<a>".repeat(40) + "</a>".repeat(40);
  refusedWith("XML_LIMIT_DEPTH", () => parseXmlString(deep, { maxDepth: 32 }));
});

test("refuses a text node longer than the limit", () => {
  refusedWith("XML_LIMIT_TEXT", () => parseXmlString(`<a>${"x".repeat(200)}</a>`, { maxTextChars: 100 }));
});

test("refuses more elements than the limit", () => {
  refusedWith("XML_LIMIT_ELEMENTS", () => parseXmlString(`<a>${"<b/>".repeat(50)}</a>`, { maxElements: 20 }));
});

test("refuses more input than the limit", () => {
  refusedWith("XML_LIMIT_SIZE", () => parseXmlString(`<a>${"<b/>".repeat(50)}</a>`, { maxInputChars: 64 }));
});

test("refuses more attributes than the limit", () => {
  const attrs = Array.from({ length: 10 }, (_, i) => `a${i}="1"`).join(" ");
  refusedWith("XML_LIMIT_ATTRIBUTES", () => parseXmlString(`<a ${attrs}/>`, { maxAttributes: 5 }));
});

test("refuses an encoding other than UTF-8", () => {
  refusedWith("XML_ENCODING_REFUSED", () => parseXmlString('<?xml version="1.0" encoding="ISO-8859-1"?><a/>'));
});

test("refuses mismatched tags and says where, never what", () => {
  assert.throws(
    () => parseXmlString("<a>\n<b>SYNTHSECRETVALUE</c></a>"),
    (err) => {
      assert.equal(err.code, "XML_MALFORMED");
      assert.equal(err.line, 2);
      assert.ok(!err.message.includes("SYNTHSECRETVALUE"));
      assert.ok(!err.message.includes("<b>"));
      return true;
    },
  );
});

test("refuses a second root element and text outside the root", () => {
  refusedWith("XML_MALFORMED", () => parseXmlString("<a/><b/>"));
  refusedWith("XML_MALFORMED", () => parseXmlString("<a/>tail"));
  refusedWith("XML_MALFORMED", () => parseXmlString("<a>"));
  refusedWith("XML_MALFORMED", () => parseXmlString(""));
});

test("refuses a duplicate attribute", () => {
  refusedWith("XML_MALFORMED", () => parseXmlString('<a x="1" x="2"/>'));
});
