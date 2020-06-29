const { Pool } = require('pg')
const UniqueIndexViolationErrCode = '23505'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
pool.on('acquire', () => {
})
pool.on('remove', () => {
})
pool.on('connect', () => {
})
pool.on('error', (e) => {
})

const shutdownPool = async () => {
  await pool.end()
}

const findOne = async (tableName, condition) => {
  let rows = await find(tableName, condition)
  if (rows && rows.length > 0) {
    return rows[0]
  }
  return null
}

const find = async (tableName, condition) => {
  let parts = [`SELECT * FROM ${tableName}`]
  let conditionQuery = buildConditionSql(condition)
  parts.push(conditionQuery)
  let query = parts.join(' ')
  let dollarValues = Object.keys(condition).map((key) => condition[key])
  let result = await pool.query(query, dollarValues)
  return result.rows
}

const insert = async (tr, tableName, columnValues, returning = ['id']) => {
  let parts = [`INSERT INTO ${tableName}`]
  let insertColumns = Object.keys(columnValues)
  parts.push(`(${insertColumns.join(', ')})`)
  parts.push('VALUES')
  let dollars = Object.keys(columnValues).map((_, i) => `$${i + 1}`)
  parts.push(`(${dollars.join(', ')})`)
  parts.push(`RETURNING ${returning.join(', ')}`)
  let dollarValues = Object.keys(columnValues).map((key) => columnValues[key])
  let query = parts.join(' ')
  try {
    let result = await (tr || pool).query(query, dollarValues)
    if (result.rows && result.rows.length > 0) {
      return result.rows[0]
    }
  } catch (e) {
    if (e.code && e.code === UniqueIndexViolationErrCode) {
      throw new UniqueIndexError(e)
    }
    throw e
  }
}

const update = async (tr, tableName, columnValues, condition) => {
  let parts = [`UPDATE ${tableName} SET`]
  let updateParts = []
  Object.keys(columnValues).forEach((columnName, i) => {
    updateParts.push(`${columnName} = $${i + 1}`)
  })
  parts.push(updateParts.join(', '))
  parts.push(buildConditionSql(condition, updateParts.length))
  let query = parts.join(' ')
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

const del = async (tr, tableName, condition) => {
  let parts = [`DELETE FROM ${tableName}`]
  parts.push(buildConditionSql(condition))
  let query = parts.join(' ')
  let dollarValues = Object.keys(condition).map((key) => condition[key])
  let result = await (tr || pool).query(query, dollarValues)
  return result.rows
}

const query = async (tr, sql, dollarValues) => {
  let result = await (tr || pool).query(sql, dollarValues)
  return result
}

const buildConditionSql = (condition, startDollarNumbering = 0) => {
  if (!condition || Object.keys(condition).length === 0) {
    return null
  }
  let parts = []
  let conditionParts = []
  Object.keys(condition).forEach((key, i) => {
    let value = condition[key]
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

const withTransaction = async (cb, onAfterRollback) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let result = await cb(client)
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

const mapToColumns = (attrs, map) => {
  if (!attrs) {
    return {}
  }
  return Object.keys(attrs).reduce((obj, key) => {
    const column = map[key]
    if (!column) {
      throw new Error(`Unknown attribute: ${key}`)
    }
    obj[column] = attrs[key]
    return obj
  }, {})
}

const mapFromColumns = (row, map) => {
  if (!row) {
    return null
  }
  return Object.keys(map).reduce((obj, key) => {
    const column = map[key]
    obj[key] = row[column]
    return obj
  }, {})
}

class UniqueIndexError extends Error {
  constructor({ table, constraint, detail }) {
    super(detail)
    this.table = table
    this.constraint = constraint
    this.columns = this.parseColumns(detail)
  }

  parseColumns(detail) {
    // error message usually looks like this (in case of a single-column) index violation
    // Key (email)=(valentin@fingerprintjs.com) already exists.
    // or like this (in case of a multi-column) index violation
    // Key (customer_id, display_name)=(cus_JOgWoKqN6pizGN, sub1) already exists.
    let parts = detail.split('=')
    parts = parts[0].split(/[\(\)]/)
    let rawColumns = parts[1]
    return rawColumns.split(', ')
  }
}

module.exports = {
  shutdownPool,
  find,
  findOne,
  insert,
  update,
  del,
  mapToColumns,
  mapFromColumns,
  withTransaction,
  query,
  UniqueIndexError,
}
