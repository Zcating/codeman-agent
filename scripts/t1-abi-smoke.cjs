// Smoke test: better-sqlite3 ABI matches Electron ABI after postinstall rebuild.
// Exit 0 = ABI OK; non-zero = ABI mismatch (rebuild needed).
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec('CREATE VIRTUAL TABLE t USING fts5(content)');
db.exec("INSERT INTO t VALUES ('hello')");
const rows = db.prepare('SELECT * FROM t').all();
console.log(JSON.stringify(rows));
if (!rows || rows.length !== 1 || rows[0].content !== 'hello') {
  console.error('ABI smoke FAILED: unexpected rows');
  process.exit(1);
}
console.log('ABI smoke PASS');
db.close();