import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { connectWebHost } from "./web-smoke-client.mjs";

function pdf() {
  const text = "BT /F1 18 Tf 20 150 Td (Iris PDF viewer fixture) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 220] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
function wav() {
  const frames = 48000;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24);
  bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index++)
    bytes.writeInt16LE(
      Math.round(Math.sin((index * Math.PI * 440) / 12000) * 6000),
      44 + index * 2,
    );
  return bytes;
}
function glb() {
  const binary = Buffer.alloc(44);
  [-1, -1, 0, 1, -1, 0, 0, 1, 0].forEach((value, index) => {
    binary.writeFloatLE(value, index * 4);
  });
  [0, 1, 2].forEach((value, index) => {
    binary.writeUInt16LE(value, 36 + index * 2);
  });
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0", generator: "Iris deterministic viewer fixture" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 }, indices: 1, material: 0 },
          ],
        },
      ],
      materials: [
        {
          doubleSided: true,
          pbrMetallicRoughness: {
            baseColorFactor: [0.2, 0.6, 0.9, 1],
            metallicFactor: 0,
            roughnessFactor: 0.8,
          },
        },
      ],
      buffers: [{ byteLength: binary.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
        { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [-1, -1, 0],
          max: [1, 1, 0],
        },
        { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      ],
    }),
  );
  const padded = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 32),
  ]);
  const output = Buffer.alloc(28 + padded.length + binary.length);
  output.write("glTF");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(output, 20);
  const offset = 20 + padded.length;
  output.writeUInt32LE(binary.length, offset);
  output.writeUInt32LE(0x004e4942, offset + 4);
  binary.copy(output, offset + 8);
  return output;
}
const host = await connectWebHost();
const image = await sharp({
  create: { width: 320, height: 200, channels: 3, background: "#5b9279" },
})
  .png()
  .toBuffer();
const epub = new JSZip();
epub.file("mimetype", "application/epub+zip", { compression: "STORE" });
epub.file(
  "META-INF/container.xml",
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
);
epub.file(
  "OEBPS/content.opf",
  '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">iris-viewer-fixture</dc:identifier><dc:title>Iris EPUB viewer fixture</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
);
epub.file(
  "OEBPS/nav.xhtml",
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Fixture chapter</a></li></ol></nav></body></html>',
);
epub.file(
  "OEBPS/chapter.xhtml",
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Fixture chapter</title></head><body><h1>Iris EPUB fixture chapter</h1><p>Offline book content with no external resources.</p></body></html>',
);
const archive = new JSZip();
archive.file("nested/readme.txt", "Iris ZIP viewer fixture");
archive.file("image.png", image);
const live = new JSZip();
live.file("photo.png", image);
live.file("motion.mp4", await readFile(resolve("test/fixtures/web/video.mp4")));
live.file(
  "captions.vtt",
  "WEBVTT\n\n00:00.000 --> 00:04.000\nIris Live Photo fixture\n",
);
const docx = new JSZip();
docx.file(
  "[Content_Types].xml",
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
docx.file(
  "_rels/.rels",
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="thumbnail" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.png"/></Relationships>',
);
docx.file(
  "word/document.xml",
  '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Iris native document preview fixture</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
);
docx.file("docProps/thumbnail.png", image);
const fixtures = [
  {
    kind: "media",
    name: "viewer-native-image.heic",
    bytes: await readFile(resolve("test/fixtures/portrait.heic")),
  },
  { kind: "pdf", name: "viewer-document.pdf", bytes: pdf() },
  { kind: "audio", name: "viewer-audio.wav", bytes: wav() },
  {
    kind: "font",
    name: "viewer-font.woff2",
    bytes: await readFile(
      resolve("src/renderer/src/assets/fonts/inter/variable.woff2"),
    ),
  },
  {
    kind: "text",
    name: "viewer-text.txt",
    bytes: Buffer.from(
      "Iris text viewer fixture\nOffline text with Unicode: café, 水, 🎨.\n",
    ),
  },
  {
    kind: "epub",
    name: "viewer-book.epub",
    bytes: await epub.generateAsync({ type: "nodebuffer" }),
  },
  { kind: "model", name: "viewer-model.glb", bytes: glb() },
  {
    kind: "archive",
    name: "viewer-archive.zip",
    bytes: await archive.generateAsync({ type: "nodebuffer" }),
  },
  {
    kind: "live-photo",
    name: "viewer-motion.livp",
    bytes: await live.generateAsync({ type: "nodebuffer" }),
  },
  {
    kind: "safe-web",
    name: "viewer-page.html",
    bytes: Buffer.from(
      '<!doctype html><h1>Iris offline HTML fixture</h1><script>parent.irisUntrustedExecuted=true;fetch("/web/query",{method:"POST",credentials:"include",body:JSON.stringify({name:"folders.create",params:{name:"UNTRUSTED CONTENT EXECUTED"}})})</script><form action="https://example.invalid"><input name="secret"></form>',
    ),
  },
  {
    kind: "native-preview",
    name: "viewer-office.docx",
    bytes: await docx.generateAsync({ type: "nodebuffer" }),
  },
  {
    kind: "generic",
    name: "viewer-generic.iris-fixture",
    bytes: Buffer.from("Iris original file download fixture"),
  },
];
const proof = [];
for (const fixture of fixtures) {
  const uploaded = await host.request("upload", undefined, {
    method: "PUT",
    headers: {
      ...host.headers,
      "content-type": "application/octet-stream",
      "x-iris-filename": fixture.name,
    },
    body: fixture.bytes,
  });
  assert.equal(uploaded.status, 200);
  const ticket = await uploaded.json();
  const imported = await host.call("files", {
    name: "saves.importFiles",
    params: { paths: [ticket.token], tags: ["Iris viewer fixture"] },
  });
  assert.equal(imported.ok, true, fixture.name);
  assert.equal(imported.ids.length, 1);
  proof.push({ kind: fixture.kind, name: fixture.name, id: imported.ids[0] });
  console.log("WEB_VIEWER_FIXTURE_IMPORTED", fixture.kind);
}
await writeFile(
  join(host.sandbox, "viewer-fixtures.json"),
  JSON.stringify(proof),
);
console.log(
  "WEB_VIEWER_FIXTURES_READY",
  JSON.stringify({ fixtures: proof.length }),
);
