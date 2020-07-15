#!/usr/bin/env node

import path from 'path'
import { Migrator } from '../migrator'

function printUsage() {
  const usage = `
  Nice PG SQL Toolkit: migrate CLI

  USAGE:
  yarn migrate migrations_dir [up|down]

  Example to run all pending migrations (direction is up by default)
  yarn migrate db/migrations

  Example to migrate down
  yarn migrate db/migrations down`
  console.log(usage)
}

async function run() {
  console.log(process.cwd())
  const [dir, direction] = process.argv.slice(2)
  if (!dir) {
    printUsage()
    return
  }
  const dirPath = path.join(process.cwd(), dir)
  const migrator = new Migrator(dirPath)
  if (!direction || direction == 'up') {
    return await migrator.up()
  } else if (direction == 'down') {
    return await migrator.down()
  }
  printUsage()
}
run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e.message)
    process.exit(1)
  })
