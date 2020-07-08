Nice PG SQL toolkit
============================

🧰 Tiny SQL toolkit for PG + Node (<200 LOC)

```
npm i nice-pg-sql-toolkit
or
yarn add nice-pg-sql-toolkit
```

## Usage

Your database URL should be in `DATABASE_URL` env var, e.g.

```shell script
export DATABASE_URL=postgres://user:password@host/database:5432
```

### Define your model, for example models/user

```js
// models/user.js
const db = require('nice-pg-sql-toolkit')

const TableName = 'users'

// model attribute to column mapping object
const Columns = {
  id: 'user_id',
  firstName: 'first_name',
  lastName: 'last_name',
  createdAt: 'created_at'
}

const findOne = async (condition) => {
  let conditionValues = db.mapToColumns(condition, columns)
  let row = await db.findOne(TableName, conditionValues)
  return db.mapFromColumns(row, columns)
}

const find = async (condition) => {
  let conditionValues = db.mapToColumns(condition, columns)
  let rows = await db.find(TableName, conditionValues)
  return rows.map((row) => db.mapFromColumns(row, columns))
}

// second optional argument is a current transaction
// transactions are optional and only required when
// you need to execute multiple SQL statements as a single unit
const create = async (attrs, tr) => {
  let columnValues = db.mapToColumns(attrs, columns)
  return await db.insert(tr, TableName, columnValues)
}

const update = async (condition, attrs, tr) => {
  let conditionValues = db.mapToColumns(condition, columns)
  let columnValues = db.mapToColumns(attrs, columns)
  return await db.update(tr, TableName, columnValues, conditionValues)
}

const del = async (condition, tr) => {
  let conditionValues = db.mapToColumns(condition, columns)
  return await db.del(tr, TableName, conditionValues)
}
```

### Use your model

```js
const user = require('/models/user')

// find one (e.g. by ID)
let user = await User.findOne({id: 3956})
// if no user is found, null will be returned


// find multiple users
let users = await User.find({lastName: 'Smith'})
// if no users were found, empty array will be returned


// add a new user
let user = await User.create({firstName: 'John', lastName: 'Smith'})


// update existing user
// update a user by ID
await User.update({id: 3956}, {lastName: 'Bunyan'})


// delete user
// delete a user by ID
await User.del({id: 3956})
```
### Using inline SQL

```js
// models/user.js

const findByFirstNameWithLimit = async (firstName, limit) => {
  const sql = `SELECT * from ${TableName} WHERE firstName = $1 order by ID DESC LIMIT $2`
  let rows = await db.query(sql, [firstName, limit])
  return rows.map((row) => db.mapFromColumns(row, columns))
}
```

### Using transactions

```js
// using transaction requires wrapping everything in a transaction and
// passing the current transaction as the last parameter
let userAudit = await db.withTransaction(async (tr) => {
  await User.update({id: 9363}, {lastName: 'Bunyan'}, tr)
  return await UserAudit.create({entity: 'User', op: 'update', args: [{lastName: 'Bunyan'}]}, tr)
})
// note that the return value from the callback will be returned by withTransaction function
```

If you want to execute certain actions after the transaction was rolled back,
use the second function argument for this.

```js
let onRollback = () => {
  // cleanup external resources
  // e.g. // payment gateway rollback etc
}
await db.withTransaction(tr => {/* do something in transaction.. */}, onRollback)
```

### Unique index violation

```js
  // checking error type will tell you if it's a unique index violation
  try {
    let user = await User.create({email: 'smith@example.com'})
  } catch(e) {
    if(e instanceof db.UniqueIndexError) {
      console.log('Unique index violation on table: users, columns:', e.columns)
    }
  }
```

MIT Licensed.

Copyright FingerprintJS Inc., 2020.


