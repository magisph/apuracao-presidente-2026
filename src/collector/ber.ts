// Strict BER reader. ASN.1 structure is interpreted independently; no external decoder is bundled.
export interface BerNode {
  cls: number;
  tag: number;
  constructed: boolean;
  bytes: Uint8Array;
  children: BerNode[];
}
export function parseBer(data: Uint8Array, depth = 0): BerNode[] {
  if (depth > 40) throw Error("BER nesting limit");
  const nodes: BerNode[] = [];
  let pos = 0;
  while (pos < data.length) {
    if (pos + 2 > data.length) throw Error("truncated BER header");
    const tagByte = data[pos++],
      constructed = !!(tagByte & 32),
      cls = tagByte >> 6;
    let tag = tagByte & 31;
    if (tag === 31) {
      tag = 0;
      let octets = 0,
        b;
      do {
        if (pos >= data.length || ++octets > 4)
          throw Error("truncated BER tag");
        b = data[pos++];
        tag = tag * 128 + (b & 127);
      } while (b & 128);
    }
    let length = data[pos++];
    if (length === 128) throw Error("indefinite BER not supported");
    if (length & 128) {
      const octets = length & 127;
      if (!octets || octets > 4 || pos + octets > data.length)
        throw Error("truncated BER length");
      length = 0;
      for (let i = 0; i < octets; i++) length = length * 256 + data[pos++];
    }
    if (pos + length > data.length) throw Error("truncated BER value");
    const bytes = data.subarray(pos, pos + length);
    pos += length;
    nodes.push({
      cls,
      tag,
      constructed,
      bytes,
      children: constructed ? parseBer(bytes, depth + 1) : [],
    });
  }
  return nodes;
}
const integer = (n: BerNode | undefined) => {
  if (
    !n ||
    n.constructed ||
    n.bytes.length > 6 ||
    !n.bytes.length ||
    n.bytes[0] & 128
  )
    throw Error("invalid unsigned ASN integer");
  return n.bytes.reduce((a, v) => a * 256 + v, 0);
};
const walk = (nodes: BerNode[]): BerNode[] =>
  nodes.flatMap((n) => [n, ...walk(n.children)]);
export function decodePresidentialBU(
  bytes: Uint8Array,
  election: number,
  office: number,
  aNumber: number,
  bNumber: number,
) {
  const outer = parseBer(bytes);
  const envelope = outer[0];
  if (!envelope?.constructed) throw Error("BU envelope missing");
  const payloads = envelope.children.filter(
    (n) => n.cls === 0 && n.tag === 4 && !n.constructed && n.bytes.length > 100,
  );
  if (payloads.length !== 1) throw Error("ambiguous BU payload");
  const nodes = walk(parseBer(payloads[0].bytes));
  const elections = nodes.filter(
    (n) =>
      n.cls === 0 &&
      n.tag === 16 &&
      n.children.length >= 5 &&
      n.children[0].cls === 0 &&
      n.children[0].tag === 2 &&
      integer(n.children[0]) === election &&
      n.children[1].tag === 2,
  );
  if (elections.length !== 1)
    throw Error("election missing or ambiguous in BU");
  const e = elections[0],
    offices = walk(e.children).filter(
      (n) =>
        n.tag === 16 &&
        n.children.length >= 3 &&
        n.children[0].cls === 2 &&
        n.children[0].tag === 1 &&
        !n.children[0].constructed &&
        integer(n.children[0]) === office &&
        n.children[1].cls === 0 &&
        n.children[1].tag === 2 &&
        n.children[2].cls === 0 &&
        n.children[2].tag === 16 &&
        n.children[2].constructed,
    );
  if (offices.length !== 1) throw Error("office missing or ambiguous in BU");
  const result = {
    electorate: integer(e.children[1]),
    a: 0,
    b: 0,
    other: 0,
    blank: 0,
    null: 0,
  };
  for (const row of offices[0].children[2].children) {
    const type = row.children.find((n) => n.cls === 2 && n.tag === 1),
      quantity = row.children.find((n) => n.cls === 2 && n.tag === 2),
      candidate = row.children.find((n) => n.cls === 2 && n.tag === 3);
    if (!type || !quantity) throw Error("malformed vote row");
    const t = integer(type),
      q = integer(quantity);
    if (t === 1) {
      const id = integer(candidate?.children.at(-1));
      if (id === aNumber) result.a += q;
      else if (id === bNumber) result.b += q;
      else result.other += q;
    } else if (t === 2) result.blank += q;
    else if (t === 3) result.null += q;
    else throw Error("unknown vote type");
  }
  return result;
}
