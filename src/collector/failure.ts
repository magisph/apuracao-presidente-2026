// Fatal: fencing, invalid payloads, base mismatch, local durability. Transient: 5xx, 429, network, deadline.
// The Worker's catch-all answers 400 "request rejected" for thrown exceptions, including D1 failures and quota.
export function isFatalCollectionError(e: unknown) {
  const message = String(e);
  if (message.includes("hash mismatch") || message.includes("ingestion outbox persistence")) return true;
  const status = Number(message.match(/ingestion \S+: (\d{3})/)?.[1]);
  if (status === 400 && message.includes('"request rejected"')) return false;
  return status >= 400 && status < 500 && status !== 429;
}
