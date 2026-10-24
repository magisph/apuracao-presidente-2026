import yauzl from "yauzl";
import type { Readable } from "node:stream";
export async function openCsvZip(
  path: string,
): Promise<{ stream: Readable; close: () => void }> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? Error("invalid zip"));
        return;
      }
      zip.on("error", reject);
      zip.on("end", () => reject(Error("no CSV in archive")));
      zip.on("entry", (entry) => {
        if (!entry.fileName.toLowerCase().endsWith(".csv")) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) {
            zip.close();
            reject(e);
            return;
          }
          resolve({ stream, close: () => zip.close() });
        });
      });
      zip.readEntry();
    });
  });
}
