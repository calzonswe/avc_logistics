// Placeholder site map generator (PNG encoder, no image dependencies).
//
// The seed needs a real map image so the map editor and the site dashboard map
// have something to render (and so markers land on an actual image). The
// generated file is a simple site plan: light background, a grid, a few
// building blocks, an access road and a gate.
import { deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

type RGB = [number, number, number];

/** Draws a simple site plan as a PNG buffer (8-bit RGB, no alpha). */
export function createSiteMapPng(width = 1200, height = 800): Buffer {
  const pixels = Buffer.alloc(width * height * 3);

  const setPixel = (x: number, y: number, [r, g, b]: RGB) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 3;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
  };

  const fillRect = (x0: number, y0: number, w: number, h: number, color: RGB) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPixel(x, y, color);
  };

  const strokeRect = (x0: number, y0: number, w: number, h: number, color: RGB, thickness = 2) => {
    fillRect(x0, y0, w, thickness, color);
    fillRect(x0, y0 + h - thickness, w, thickness, color);
    fillRect(x0, y0, thickness, h, color);
    fillRect(x0 + w - thickness, y0, thickness, h, color);
  };

  // Background
  fillRect(0, 0, width, height, [238, 242, 246]);

  // Grid every 100px
  for (let x = 0; x < width; x += 100) fillRect(x, 0, 1, height, [215, 222, 230]);
  for (let y = 0; y < height; y += 100) fillRect(0, y, width, 1, [215, 222, 230]);

  // Access road along the top and a vertical branch
  fillRect(0, 60, width, 46, [176, 185, 196]);
  fillRect(520, 60, 44, height - 60, [176, 185, 196]);
  for (let x = 0; x < width; x += 60) fillRect(x, 80, 28, 3, [245, 246, 248]);

  // Buildings / recycling areas
  const blocks: Array<[number, number, number, number]> = [
    [120, 180, 300, 200],
    [620, 180, 220, 160],
    [620, 420, 300, 220],
    [120, 480, 260, 180],
  ];
  for (const [x, y, w, h] of blocks) {
    fillRect(x, y, w, h, [206, 215, 226]);
    strokeRect(x, y, w, h, [150, 162, 178]);
  }

  // Gate at the road entrance
  fillRect(0, 55, 14, 56, [120, 132, 148]);

  // Assemble PNG: signature + IHDR + IDAT + IEND
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // filter: none
    pixels.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
