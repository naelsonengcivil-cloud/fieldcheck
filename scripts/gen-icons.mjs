// Gera ícones PNG do PWA sem dependências externas (usa apenas zlib do Node).
// Desenha um fundo navy com o "V" de checagem amarelo — suficiente para a
// instalabilidade do PWA (192/512). Ícones de marca refinados podem substituir
// estes arquivos depois sem mudar o build.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

const NAVY = [0x1c, 0x27, 0x33];
const YELLOW = [0xf5, 0xa8, 0x00];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// Distância de ponto a segmento, para desenhar o "check" com espessura.
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function makePng(size) {
  const s = size;
  // pontos do check em coordenadas proporcionais
  const p0 = [s * 0.29, s * 0.53];
  const p1 = [s * 0.43, s * 0.67];
  const p2 = [s * 0.71, s * 0.35];
  const stroke = s * 0.09;

  // linha bruta RGBA: cada linha começa com filtro 0
  const raw = Buffer.alloc((s * 4 + 1) * s);
  for (let y = 0; y < s; y++) {
    const rowStart = y * (s * 4 + 1);
    raw[rowStart] = 0; // filtro None
    for (let x = 0; x < s; x++) {
      const d1 = distToSeg(x, y, p0[0], p0[1], p1[0], p1[1]);
      const d2 = distToSeg(x, y, p1[0], p1[1], p2[0], p2[1]);
      const onCheck = Math.min(d1, d2) <= stroke / 2;
      const [r, g, b] = onCheck ? YELLOW : NAVY;
      const o = rowStart + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const png = makePng(size);
  writeFileSync(join(OUT, `icon-${size}.png`), png);
  console.log(`icons/icon-${size}.png (${png.length} bytes)`);
}
