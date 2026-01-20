import { describe, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { GitLedgerRepository } from '../../src/adapters/git/git-ledger-repository.js'
import { createLedgerRepositoryContractTests } from '../contract/ledger-repository.contract.js'

describe('GitLedgerRepository', () => {
  let tempDir: string
  let journalPath: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grootboek-test-'))
    journalPath = path.join(tempDir, 'test.journal')
    await fs.writeFile(journalPath, '')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  createLedgerRepositoryContractTests(
    'GitLedgerRepository',
    async () => {
      return new GitLedgerRepository({
        journalPath,
        autoCommit: false
      })
    }
  )
})
