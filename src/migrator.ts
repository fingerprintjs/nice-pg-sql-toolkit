import fs from 'fs'
import path from 'path'

import { findOne, query, withTransaction, insert, del } from './index'
import { PoolClient } from 'pg'

const versionsTableName = 'db_versions'

const enum Direction {
  up,
  down,
}

class Migration {
  readonly version: number
  readonly direction: Direction
  readonly fileName: string
  constructor(version: number, direction: Direction, fileName: string) {
    this.version = version
    this.direction = direction
    this.fileName = fileName
  }
}

export class Migrator {
  readonly dir: string
  constructor(dir: string) {
    this.dir = dir
  }

  async up() {
    await this.prereq()
    await this.runPendingUpMigrations()
  }

  async down() {
    await this.prereq()
    const currentDbVersion = await this.currentDbVersion()
    const downMigration = this.findMigration(currentDbVersion, Direction.down)
    if (!downMigration) {
      return
    }
    await withTransaction(async (tr) => {
      await this.runMigrationInDb(downMigration, tr)
    })
  }

  private async prereq() {
    if (!(await this.versionsTableExists())) {
      await this.createVersionsTable()
    }
  }

  private async versionsTableExists(): Promise<boolean> {
    const table = await findOne('information_schema.tables', { table_schema: 'public', table_name: versionsTableName })
    return table != null
  }

  private async createVersionsTable() {
    const versionsTableCreateSql = `
      CREATE TABLE ${versionsTableName} (
        version int unique,
        timestamp timestamptz default now()
      )
    `
    await query(versionsTableCreateSql)
  }

  private async currentDbVersion(): Promise<number> {
    const result = await query(`SELECT max(version) as version FROM ${versionsTableName}`)
    const rawVersion = result.rows[0]['version']
    if (!rawVersion) {
      return 0
    }
    return parseInt(rawVersion as string)
  }

  /**
   * runs all pending migrations
   */
  private async runPendingUpMigrations() {
    const pendingMigrations = await this.listPendingUpMigrations()
    await withTransaction(async (tr) => {
      for (const migration of pendingMigrations) {
        await this.runMigrationInDb(migration, tr)
      }
    })
  }

  private async runMigrationInDb(migration: Migration, tr: PoolClient) {
    const fullFilePath = path.join(this.dir, migration.fileName)
    const fileContents = fs.readFileSync(fullFilePath, { encoding: 'utf8', flag: 'r' })
    await query(fileContents, [], tr)
    if (migration.direction == Direction.up) {
      await insert(versionsTableName, { version: migration.version }, [], tr)
    } else {
      await del(versionsTableName, { version: migration.version }, tr)
    }
  }

  private async listPendingUpMigrations(): Promise<Migration[]> {
    const currentDbVersion = await this.currentDbVersion()
    return this.listMigrations(Direction.up).filter((m) => m.version > currentDbVersion)
  }

  private findMigration(version: number, direction: Direction): Migration | undefined {
    return this.listMigrations(direction).find((m) => m.version == version)
  }

  private listMigrations(direction: Direction): Migration[] {
    return this.listMigrationFiles(direction).map((f) => {
      const version = parseInt(f)
      return new Migration(version, direction, f)
    })
  }

  private listMigrationFiles(direction: Direction): string[] {
    const fileExtension = direction == Direction.up ? 'up.sql' : 'down.sql'
    return fs.readdirSync(this.dir).filter((f) => f.endsWith(fileExtension))
  }
}
