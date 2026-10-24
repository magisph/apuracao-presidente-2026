import { DatabaseSync } from "node:sqlite";
export function localLock(path: string): () => void {
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS runner_lock(id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE;",
    );
  } catch (e) {
    db.close();
    throw Error(
      "Já existe um coletor local ativo, ou o lock não pôde ser adquirido.",
      { cause: e },
    );
  }
  return () => {
    db.exec("ROLLBACK");
    db.close();
  };
}
