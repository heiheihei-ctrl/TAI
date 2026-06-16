const readUint32BE = (view: Uint8Array, offset: number): number =>
  ((view[offset] << 24) |
    (view[offset + 1] << 16) |
    (view[offset + 2] << 8) |
    view[offset + 3]) >>>
  0;

const isSignature = (view: Uint8Array, offset: number, sig: string): boolean => {
  for (let i = 0; i < sig.length; i++) {
    if (view[offset + i] !== sig.charCodeAt(i)) return false;
  }
  return true;
};

/** Remove 8BIM `patt` chunks; sampled brush shapes do not need texture patterns. */
export const stripAbrPatternSections = (buffer: ArrayBuffer): Uint8Array => {
  const input = new Uint8Array(buffer);
  if (input.length < 4) return input;

  const chunks: Uint8Array[] = [input.slice(0, 4)];
  let offset = 4;

  while (offset + 12 <= input.length) {
    if (!isSignature(input, offset, '8BIM')) {
      chunks.push(input.slice(offset));
      break;
    }

    const type = String.fromCharCode(
      input[offset + 4],
      input[offset + 5],
      input[offset + 6],
      input[offset + 7],
    );
    const size = readUint32BE(input, offset + 8);
    let chunkTotal = 12 + size;
    while (chunkTotal % 4 !== 0) chunkTotal += 1;

    if (offset + chunkTotal > input.length) {
      chunks.push(input.slice(offset));
      break;
    }

    if (type !== 'patt') {
      chunks.push(input.slice(offset, offset + chunkTotal));
    }

    offset += chunkTotal;
  }

  const totalLength = chunks.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const part of chunks) {
    output.set(part, writeOffset);
    writeOffset += part.length;
  }
  return output;
};
