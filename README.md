<div style="text-align:center">

![logo](https://fpjs-public.s3.amazonaws.com/oss/nice-pg-sql-toolkit/logo.jpg)

Nice PG SQL toolkit
============================

![build](https://github.com/fingerprintjs/nice-pg-sql-toolkit/workflows/build/badge.svg)

</div>

🧰 Nice SQL toolkit for PG + Node (tiny, <200 LOC)

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

### Simple usage
_this approach is a good starting point, it uses DB-level attributes directly w/out column mapping_

```js
const db = require('nice-pg-sql-toolkit')

// find one user by email
let row = await db.findOne('users', {email: 'john@example.com'})


// find all users by role
let rows = await db.find('users', {role: 'admin'})

// find all users by multiple roles
let rows = await db.find('users', {role: ['admin', 'root', 'superuser']})

// insert a user
let attrs = await db.insert('users', {email: 'john@example.com', role: 'admin'})
// attrs will have the id attribute if you have an id primary key

// update all users by role, set their access_level to 'full'
await db.update('users', {'access_level': 'full'}, {'role': 'admin'})

// delete a user by ID
await db.del('users', {id: 23234554})

// use inline SQL directly
const sql = `SELECT * FROM users WHERE firstName = $1 ORDER BY ID DESC LIMIT $2`
// pass dollar params as a second argument as an array
let firstName = 'John'
let limit = 10
let rows = await db.query(sql, [firstName, limit])
```

### Define your model, for example models/user
_this is convenient if you want to keep your logic centralized and also perform column mapping_

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

const create = async (attrs) => {
  let columnValues = db.mapToColumns(attrs, columns)
  return await db.insert(TableName, columnValues)
}

const update = async (condition, attrs) => {
  let conditionValues = db.mapToColumns(condition, columns)
  let columnValues = db.mapToColumns(attrs, columns)
  return await db.update(TableName, columnValues, conditionValues)
}

const del = async (condition) => {
  let conditionValues = db.mapToColumns(condition, columns)
  return await db.del(TableName, conditionValues)
}
```

```js
// Now you can use your model everywhere
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

### Using transactions

```js
// using transaction requires wrapping everything in a transaction and
// passing the current transaction as a last argument
let userAudit = await db.withTransaction(async (tr) => {
  await db.update('users', {id: 9363}, {lastName: 'Bunyan'}, tr)
  return await db.create('users_audit', {entity: 'User', op: 'update', args: [{lastName: 'Bunyan'}]}, tr)
})
// note that the return value from the callback will be returned by withTransaction function
```

If you want to execute certain actions after the transaction is rolled back,
use the second function argument for this.

```js
let onRollback = () => {
  // cleanup external resources
  // e.g. // payment gateway rollback etc
}
let res = await db.withTransaction(tr => {/* do something in transaction.. */}, onRollback)
```

### Unique index violation

```js
  // checking error type will tell you if it's a unique index violation
  try {
    let user = await db.create('users', {email: 'smith@example.com'})
  } catch(e) {
    if(e instanceof db.UniqueIndexError) {
      console.log('Unique index violation on table: users, columns:', e.columns)
    }
  }
```

MIT Licensed.

Copyright FingerprintJS Inc., 2020.


