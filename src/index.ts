import { Pool, PoolClient } from 'pg'
import { Migrator } from './migrator'

// PoolOptions has inconsistent capitalization, but that's because pg PoolConfig has it this way
// I'm leaving it as is and not creating a mapping on purpose
interface PoolOptions {
  connectionString?: string,
  connectionTimeoutMillis?: number,
  query_timeout?: number,
  max?: number
}

const UniqueIndexViolationErrCode = '23505'

const DefaultConnectionTimeout = 5000
const DefaultQueryTimeout = 10_000
const DefaultPoolSize = 10

const createPoolOptions = (poolOptions?: PoolOptions): PoolOptions => {
  const newPoolOptions: PoolOptions = {
    connectionString: poolOptions?.connectionString ?? process.env.DATABASE_URL,
    connectionTimeoutMillis: Number(poolOptions?.connectionString ?? 
      process.env.DATABASE_CONNECTION_TIMEOUT ??  DefaultConnectionTimeout),
    query_timeout: Number(poolOptions?.query_timeout ??
      process.env.DATABASE_QUERY_TIMEOUT ?? DefaultQueryTimeout),
    max: Number(poolOptions?.max ?? process.env.DATABASE_POOL_SIZE ?? DefaultPoolSize)
  }
  return newPoolOptions
}

// creating default pool with default options
let pool = new Pool(createPoolOptions())

// allows to recreatePool with new options
export const recreatePool = (poolOptions?: PoolOptions) => {
  pool = new Pool(createPoolOptions(poolOptions))
}

export const findOne = async (
  tableName: string,
  condition: Record<string, unknown>
): Promise<Record<string, unknown> | null> => {
  const rows = await find(tableName, condition)
  if (rows && rows.length > 0) {
    return rows[0]
  }
  return null
}

export const find = async (
  tableName: string,
  condition: Record<string, unknown>
): Promise<Record<string, unknown>[]> => {
  const parts = [`SELECT * FROM ${tableName}`]
  const conditionQuery = buildConditionSql(condition)
  parts.push(conditionQuery)
  const query = parts.join(' ')
  const dollarValues = Object.keys(condition).map((key) => condition[key])
  const result = await pool.query(query, dollarValues)
  return result.rows
}

export const insert = async (
  tableName: string,
  columnValues: Record<string, unknown>,
  returning = ['id'],
  tr?: PoolClient
): Promise<Record<string, unknown> | null> => {
  const parts = [`INSERT INTO ${tableName}`]
  const insertColumns = Object.keys(columnValues)
  parts.push(`(${insertColumns.join(', ')})`)
  parts.push('VALUES')
  const dollars = Object.keys(columnValues).map((_, i) => `$${i + 1}`)
  parts.push(`(${dollars.join(', ')})`)
  if (returning.length > 0) {
    parts.push(`RETURNING ${returning.join(', ')}`)
  }
  const dollarValues = Object.keys(columnValues).map((key) => columnValues[key])
  const query = parts.join(' ')
  try {
    const result = await (tr || pool).query(query, dollarValues)
    if (result.rows && result.rows.length > 0) {
      return result.rows[0]
    }
  } catch (e) {
    if (e.code && e.code === UniqueIndexViolationErrCode) {
      throw new UniqueIndexError(e)
    }
    throw e
  }
  return null
}

export const update = async (
  tableName: string,
  columnValues: Record<string, unknown>,
  condition: Record<string, unknown>,
  tr?: PoolClient
): Promise<boolean> => {
  const parts = [`UPDATE ${tableName} SET`]
  const updateParts: string[] = []
  Object.keys(columnValues).forEach((columnName, i) => {
    updateParts.push(`${columnName} = $${i + 1}`)
  })
  parts.push(updateParts.join(', '))
  parts.push(buildConditionSql(condition, updateParts.length))
  const query = parts.join(' ')
  let dollarValues = Object.keys(columnValues).map((key) => columnValues[key])
  if (condition !== {}) {
    dollarValues = dollarValues.concat(Object.keys(condition).map((key) => condition[key]))
  }
  try {
    await (tr || pool).query(query, dollarValues)
  } catch (e) {
    if (e.code && e.code === UniqueIndexViolationErrCode) {
      throw new UniqueIndexError(e)
    }
    throw e
  }
  return true
}

export const del = async (
  tableName: string,
  condition: Record<string, unknown>,
  tr?: PoolClient
): Promise<Record<string, unknown>[]> => {
  const parts = [`DELETE FROM ${tableName}`]
  parts.push(buildConditionSql(condition))
  const query = parts.join(' ')
  const dollarValues = Object.keys(condition).map((key) => condition[key])
  const result = await (tr || pool).query(query, dollarValues)
  return result.rows
}

export const query = async (
  sql: string,
  dollarValues: unknown[] = [],
  tr?: PoolClient
): Promise<{ rows: Record<string, unknown>[] }> => {
  const result = await (tr || pool).query(sql, dollarValues)
  return result
}

const buildConditionSql = (condition: Record<string, unknown>, startDollarNumbering = 0): string => {
  if (Object.keys(condition).length === 0) {
    return ''
  }
  const parts = []
  const conditionParts: string[] = []
  Object.keys(condition).forEach((key, i) => {
    const value = condition[key]
    // https://bit.ly/2yNyzoe
    if (Array.isArray(value)) {
      conditionParts.push(`${key} = ANY($${startDollarNumbering + i + 1})`)
    } else {
      conditionParts.push(`${key} = $${startDollarNumbering + i + 1}`)
    }
  })
  if (conditionParts.length > 0) {
    parts.push('WHERE')
    parts.push(conditionParts.join(' AND '))
  }
  return parts.join(' ')
}

export const withTransaction = async <T>(cb: (tr: PoolClient) => T, onAfterRollback?: () => void): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await cb(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK')
    if (typeof onAfterRollback === 'function') {
      onAfterRollback()
    }
    throw e
  } finally {
    client.release()
  }
}

export const mapToColumns = (attrs: Record<string, unknown>, map: Record<string, string>): Record<string, unknown> => {
  if (!attrs) {
    return {}
  }
  return Object.keys(attrs).reduce((obj: Record<string, unknown>, key: string) => {
    const column = map[key]
    if (!column) {
      throw new Error(`Unknown attribute: ${key}`)
    }
    obj[column] = attrs[key]
    return obj
  }, {})
}

export const mapFromColumns = (row: Record<string, unknown>, map: Record<string, string>): Record<string, unknown> => {
  if (!row) {
    return {}
  }
  return Object.keys(map).reduce((obj: Record<string, unknown>, key: string) => {
    const column = map[key]
    obj[key] = row[column]
    return obj
  }, {})
}

export class UniqueIndexError extends Error {
  readonly table: string
  readonly constraint: string
  readonly columns: string[]
  constructor({ table, constraint, detail }: { table: string; constraint: string; detail: string }) {
    super(detail)
    this.table = table
    this.constraint = constraint
    this.columns = this.parseColumns(detail)
  }

  parseColumns(detail: string): string[] {
    // error message usually looks like this (in case of a single-column) index violation
    // Key (email)=(valentin@fingerprintjs.com) already exists.
    // or like this (in case of a multi-column) index violation
    // Key (customer_id, display_name)=(cus_JOgWoKqN6pizGN, sub1) already exists.
    let parts = detail.split('=')
    parts = parts[0].split(/[()]/)
    const rawColumns = parts[1]
    return rawColumns.split(', ')
  }
}

/**
 * Creates a new instance of the migrator
 * @param dir - directory with migrations
 */
export function createMigrator(dir: string): Migrator {
  return new Migrator(dir)
}
