import { LedgerService } from '../../core/services/ledger-service.js'
import { FileLedgerRepository, FileLedgerRepositoryOptions } from './file-ledger-repository.js'
import { FilePriceRepository, FilePriceRepositoryOptions } from './file-price-repository.js'
import { FileProvider, NodeFileProvider, InMemoryFileProvider } from './file-provider.js'

export { FileLedgerRepository, type FileLedgerRepositoryOptions } from './file-ledger-repository.js'
export { FilePriceRepository, type FilePriceRepositoryOptions } from './file-price-repository.js'
export { type FileProvider, NodeFileProvider, InMemoryFileProvider } from './file-provider.js'

// Re-export parser/serializer for custom implementations
export { Parser, ParseError } from '../git/parser/parser.js'
export { Lexer, TokenType, type Token } from '../git/parser/lexer.js'
export { JournalWriter, type JournalWriterOptions } from '../git/serializer/journal-writer.js'
export * from '../git/parser/ast.js'

export interface CreateFileLedgerServiceOptions {
  /**
   * Path to the journal file
   */
  journalPath: string

  /**
   * Custom file provider.
   * - Node.js: Uses NodeFileProvider by default
   * - Browser: Pass InMemoryFileProvider or implement your own FileProvider
   */
  fileProvider?: FileProvider
}

/**
 * Create a LedgerService backed by a journal file.
 *
 * @example Node.js
 * ```typescript
 * const ledger = createFileLedgerService({
 *   journalPath: './my.journal'
 * })
 * ```
 *
 * @example Browser (in-memory)
 * ```typescript
 * const fileProvider = new InMemoryFileProvider()
 * const ledger = createFileLedgerService({
 *   journalPath: 'ledger.journal',
 *   fileProvider
 * })
 * ```
 *
 * @example Browser (custom storage)
 * ```typescript
 * const fileProvider: FileProvider = {
 *   read: async (path) => localStorage.getItem(path) ?? '',
 *   write: async (path, content) => localStorage.setItem(path, content),
 *   stat: async (path) => localStorage.getItem(path) ? { lastModified: new Date() } : null
 * }
 * const ledger = createFileLedgerService({ journalPath: 'ledger', fileProvider })
 * ```
 */
export function createFileLedgerService(options: CreateFileLedgerServiceOptions): LedgerService {
  const fileProvider = options.fileProvider ?? new NodeFileProvider()

  const ledgerRepository = new FileLedgerRepository({
    journalPath: options.journalPath,
    fileProvider
  })

  const priceRepository = new FilePriceRepository({
    journalPath: options.journalPath,
    fileProvider
  })

  return new LedgerService({
    ledgerRepository,
    priceRepository
  })
}
