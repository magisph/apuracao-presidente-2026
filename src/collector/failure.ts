// Fatal: fencing, invalid payloads, base mismatch, local durability. Transient: 5xx, 429, network, deadline.
export function isFatalCollectionError(e: unknown) {
  const message = String(e);
  if (message.includes("hash mismatch") || message.includes("ingestion outbox persistence")) return true;
  const status = Number(message.match(/ingestion \S+: (\d{3})/)?.[1]);
  return status >= 400 && status < 500 && status !== 429;
}
