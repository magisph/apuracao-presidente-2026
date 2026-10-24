// Streaming semicolon CSV, including quoted newlines and escaped double quotes.
export async function* csvRows(
  chunks: AsyncIterable<string>,
): AsyncGenerator<string[]> {
  let field = "",
    row: string[] = [],
    quoted = false,
    afterQuote = false,
    skipLF = false;
  for await (const chunk of chunks)
    for (const c of chunk) {
      if (skipLF) {
        skipLF = false;
        if (c === "\n") continue;
      }
      if (afterQuote) {
        if (c === '"') {
          field += '"';
          quoted = true;
          afterQuote = false;
          continue;
        }
        afterQuote = false;
      }
      if (quoted) {
        if (c === '"') {
          quoted = false;
          afterQuote = true;
        } else field += c;
        continue;
      }
      if (c === '"') {
        if (field) throw Error("invalid CSV quote");
        quoted = true;
        continue;
      }
      if (c === ";") {
        row.push(field);
        field = "";
        continue;
      }
      if (c === "\n" || c === "\r") {
        row.push(field);
        yield row;
        row = [];
        field = "";
        skipLF = c === "\r";
        continue;
      }
      field += c;
    }
  if (quoted) throw Error("truncated CSV quote");
  if (field || row.length) {
    row.push(field);
    yield row;
  }
}
