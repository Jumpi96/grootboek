import { Transaction } from '../domain/transaction.js'

export interface HeadInfo {
  version: string
  commitHash?: string
  lastModified?: Date
}

export interface TransactionFilter {
  fromDate?: Date
  toDate?: Date
  accountPattern?: string
  commodity?: string
  description?: string
  limit?: number
  offset?: number
}

export interface LedgerRepository {
  /**
   * Get current head/version information
   */
  getHead(): Promise<HeadInfo>

  /**
   * List transactions with optional filtering
   */
  listTransactions(filter?: TransactionFilter): Promise<Transaction[]>

  /**
   * Get a single transaction by ID
   */
  getTransaction(id: string): Promise<Transaction | null>

  /**
   * Append new transactions atomically
   * @returns The appended transactions with assigned IDs
   */
  appendTransactions(transactions: Transaction[]): Promise<Transaction[]>

  /**
   * Check if a transaction with the given external ID exists
   * Used for idempotency
   */
  existsExternalId(externalId: string): Promise<boolean>

  /**
   * Get all unique account names in the ledger
   */
  listAccounts(): Promise<string[]>

  /**
   * Get all unique commodity symbols in the ledger
   */
  listCommodities(): Promise<string[]>
}
