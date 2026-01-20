import * as path from 'node:path'
import { LedgerService } from '../../core/services/ledger-service.js'
import { GitLedgerRepository, GitLedgerRepositoryOptions } from './git-ledger-repository.js'
import { GitPriceRepository, GitPriceRepositoryOptions } from './git-price-repository.js'
import { GitClient, GitClientOptions } from './git-client.js'

export { GitLedgerRepository, type GitLedgerRepositoryOptions } from './git-ledger-repository.js'
export { GitPriceRepository, type GitPriceRepositoryOptions } from './git-price-repository.js'
export { GitClient, type GitClientOptions } from './git-client.js'
export { Parser, ParseError } from './parser/parser.js'
export { Lexer, TokenType, type Token } from './parser/lexer.js'
export { JournalWriter, type JournalWriterOptions } from './serializer/journal-writer.js'
export * from './parser/ast.js'

export interface CreateGitLedgerServiceOptions {
  journalPath: string
  autoCommit?: boolean
  gitAuthor?: {
    name: string
    email: string
  }
}

export function createGitLedgerService(options: CreateGitLedgerServiceOptions): LedgerService {
  const journalPath = path.resolve(options.journalPath)
  const repoPath = path.dirname(journalPath)

  const gitClient = new GitClient({
    repoPath,
    author: options.gitAuthor
  })

  const ledgerRepository = new GitLedgerRepository({
    journalPath,
    gitClient,
    autoCommit: options.autoCommit
  })

  const priceRepository = new GitPriceRepository({
    journalPath,
    gitClient,
    autoCommit: options.autoCommit
  })

  return new LedgerService({
    ledgerRepository,
    priceRepository
  })
}
