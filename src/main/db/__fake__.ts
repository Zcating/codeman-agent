/**
 * db/__fake__.ts
 *
 * ADR-0046 D3: 共享 FakeDatabase + FakeStatement
 * 实现 better-sqlite3 API 子集，供 @effect/sql-sqlite-node 测试使用。
 *
 * 增强：FakeDatabase 实际存储 INSERT 数据，SELECT 可查询已插入行。
 */

// ---------------------------------------------------------------------------
// Shared module-level state (backward compat)
// ---------------------------------------------------------------------------

/** 所有 prepare(sql)/exec/pragma 调用记录 */
export const dbCalls = [] as { sql: string; params: unknown[]; kind: string }[];

/** 可配置的返回结果（供测试 setup） */
export const fakeResults = {
  all: [] as unknown[],
  get: undefined as unknown,
  run: undefined as unknown,
};

// ---------------------------------------------------------------------------
// FakeStatement
// ---------------------------------------------------------------------------

export class FakeStatement {
  sql: string;
  readonly rows: unknown[];
  readonly changes: number;
  readonly lastInsertRowid: number;
  readonly reader: boolean;
  /** Reference to the parent FakeDatabase for accessing tables */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _db: any;

  constructor(opts: {
    sql: string;
    rows?: unknown[];
    changes?: number;
    lastInsertRowid?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db?: any;
  }) {
    this.sql = opts.sql;
    this.rows = opts.rows ?? [];
    this.changes = opts.changes ?? 0;
    this.lastInsertRowid = opts.lastInsertRowid ?? 0;
    this._db = opts.db;
    const upper = opts.sql.trim().toUpperCase();
    this.reader = upper.startsWith("SELECT") || upper.startsWith("PRAGMA");
  }

  all(..._params: unknown[]) {
    dbCalls.push({ sql: this.sql, params: _params, kind: "all" });
    const upper = this.sql.trim().toUpperCase();

    // Handle CREATE TABLE statements — record table creation and return empty
    if (upper.startsWith("CREATE TABLE")) {
      const tableMatch = upper.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1]!;
        if (this._db && typeof this._db.recordTableCreated === "function") {
          this._db.recordTableCreated(tableName);
        }
      }
      return [];
    }

    // Handle SELECT name FROM sqlite_master — return created tables
    if (upper.includes("SQLITE_MASTER") && upper.includes("SELECT NAME")) {
      if (!this._db || typeof this._db.getCreatedTables !== "function") {
        return [];
      }
      const allCreated = this._db.getCreatedTables();
      const nameMatch = this.sql.match(/name\s*=\s*'([^']+)'/i);
      if (nameMatch) {
        const wanted = nameMatch[1]!;
        return allCreated.includes(wanted) ? [{ name: wanted }] : [];
      }
      return allCreated.map((name) => ({ name }));
    }

    return this.rows;
  }

  get(..._params: unknown[]) {
    dbCalls.push({ sql: this.sql, params: _params, kind: "get" });
    return this.rows[0] ?? null;
  }

  run(..._params: unknown[]) {
    dbCalls.push({ sql: this.sql, params: _params, kind: "run" });
    return { changes: this.changes, lastInsertRowid: this.lastInsertRowid };
  }

  safeIntegers(_bool: boolean) {}
  raw(_bool: boolean) {
    return this;
  }
}

// ---------------------------------------------------------------------------
// FakeDatabase
// ---------------------------------------------------------------------------

/**
 * 可配置返回值的 fake better-sqlite3 Database。
 * 记录所有调用，供测试断言使用。
 * 支持实际 INSERT 数据存储和 SELECT 查询。
 */
export class FakeDatabase {
  filename: string;
  readonly = false;
  closed = false;

  /** 所有 prepare(sql) 调用 */
  readonly prepareCalls: Array<{ sql: string }> = [];

  /** 所有 pragma/exec 调用 */
  readonly calls: Array<{ sql: string; params?: unknown[] }> = [];

  /** sql → result 映射（用于预定义查询结果） */
  private results = new Map<
    string,
    { rows: unknown[]; changes?: number; lastInsertRowid?: number }
  >();

  /** 表名 → 行数组（用于 INSERT 数据存储） */
  private tables = new Map<string, unknown[]>();

  /** 已创建的表名（用于 sqlite_master 查询） */
  private createdTables = new Set<string>();

  /** 插入计数器（生成 lastInsertRowid） */
  private idCounter = 0;

  constructor(filename: string, _options?: { readonly?: boolean }) {
    this.filename = filename;
  }

  /** Record a table as created (called when CREATE TABLE executes) */
  recordTableCreated(tableName: string) {
    this.createdTables.add(tableName);
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, []);
    }
  }

  /** Get all created table names */
  getCreatedTables(): string[] {
    return Array.from(this.createdTables);
  }

  /** Pre-register created tables (for test setup) */
  setCreatedTables(tables: string[]) {
    for (const t of tables) {
      this.createdTables.add(t);
      if (!this.tables.has(t)) {
        this.tables.set(t, []);
      }
    }
  }

  /** 注册 SELECT/PRAGMA 查询的预定义返回值（优先于动态查询） */
  addQuery(sql: string, rows: unknown[]) {
    this.results.set(sql, { rows });
  }

  /** 注册 INSERT/UPDATE/DELETE 的变更结果 */
  addMutation(sql: string, changes = 1, lastInsertRowid = 1) {
    this.results.set(sql, { rows: [], changes, lastInsertRowid });
  }

  pragma(pragmaStr: string): unknown[] {
    this.calls.push({ sql: `PRAGMA ${pragmaStr}` });
    dbCalls.push({ sql: `PRAGMA ${pragmaStr}`, params: [], kind: "pragma" });
    return [];
  }

  prepare(sql: string): FakeStatement {
    this.prepareCalls.push({ sql });
    const upper = sql.trim().toUpperCase();

    // For SELECT queries, check if we have stored table data to query
    if (upper.startsWith("SELECT")) {
      // Check for predefined result first
      const predefined = this.results.get(sql);
      if (predefined) {
        return new FakeStatement({
          sql,
          rows: predefined.rows,
          changes: predefined.changes ?? 0,
          lastInsertRowid: predefined.lastInsertRowid ?? 0,
          db: this,
        });
      }

      // Try to extract table name and WHERE clause for dynamic query
      const fromMatch = upper.match(/FROM\s+(\w+)/);
      if (fromMatch) {
        const tableName = fromMatch[1]!;
        const storedRows = this.tables.get(tableName) ?? [];
        // Simple WHERE clause support: WHERE id = ?
        const whereMatch = sql.match(/WHERE\s+\w+\s*=\s*\?/i);
        if (whereMatch && storedRows.length > 0) {
          return new FakeStatement({ sql, rows: [storedRows[0]], db: this });
        }
        return new FakeStatement({ sql, rows: storedRows, db: this });
      }
    }

    // For INSERT statements, store the data in the table
    if (upper.startsWith("INSERT")) {
      const intoMatch = upper.match(/INSERT\s+INTO\s+(\w+)/i);
      if (intoMatch) {
        const tableName = intoMatch[1]!;
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
        // Extract column names and values from the SQL
        // Simple extraction for common patterns
        const valuesMatch = sql.match(/\(\s*(?:[^)]+)\s*\)\s*VALUES/i);
        if (valuesMatch) {
          // Generate a simple row based on column count
          const tableRows = this.tables.get(tableName)!;
          const newId = ++this.idCounter;
          // Heuristic: first column is likely id
          const newRow: Record<string, unknown> = { id: newId };
          tableRows.push(newRow);
          return new FakeStatement({
            sql,
            rows: [],
            changes: 1,
            lastInsertRowid: newId,
            db: this,
          });
        }
      }
    }

    // Check for predefined result
    const result = this.results.get(sql);
    return new FakeStatement({
      sql,
      rows: result?.rows ?? [],
      changes: result?.changes ?? 0,
      lastInsertRowid: result?.lastInsertRowid ?? 0,
      db: this,
    });
  }

  exec(sql: string) {
    this.calls.push({ sql });
    dbCalls.push({ sql, params: [], kind: "exec" });
    const upper = sql.trim().toUpperCase();

    // Handle CREATE TABLE - just acknowledge
    if (upper.startsWith("CREATE")) {
      const tableMatch = upper.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1]!;
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
      }
      return;
    }

    // Handle INSERT ... VALUES
    if (upper.startsWith("INSERT")) {
      const intoMatch = upper.match(/INSERT\s+(?:INTO\s+)?(\w+)/i);
      if (intoMatch) {
        const tableName = intoMatch[1]!;
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
        const tableRows = this.tables.get(tableName)!;
        const newId = ++this.idCounter;
        // Parse column list if present
        const columnsMatch = sql.match(/\(\s*([^)]+)\s*\)\s*VALUES/i);
        if (columnsMatch) {
          const columns = columnsMatch[1]!.split(",").map((c) => c.trim());
          // Try to extract values - very simple heuristic
          const valuesMatch = sql.match(/VALUES\s*\(\s*'([^']*)'/i);
          const newRow: Record<string, unknown> = { id: newId };
          if (valuesMatch) {
            newRow[columns[0] ?? "col0"] = valuesMatch[1];
          }
          tableRows.push(newRow);
        } else {
          tableRows.push({ id: newId });
        }
      }
      return;
    }
  }

  /** Reset all stored state for fresh test */
  reset(): void {
    this.prepareCalls.length = 0;
    this.calls.length = 0;
    this.results.clear();
    this.tables.clear();
    this.createdTables.clear();
    this.idCounter = 0;
  }

  close() {
    this.closed = true;
  }

  serialize(): Buffer {
    return Buffer.from("");
  }

  backup(_dest: string) {
    return {};
  }

  loadExtension(_path: string) {}
}
