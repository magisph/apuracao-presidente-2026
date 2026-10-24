export async function gzipText(text: string): Promise<string> {
  const bytes = new Uint8Array(
    await new Response(
      new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export async function gunzipText(encoded: string): Promise<string> {
  const binary = atob(encoded),
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).text();
}
