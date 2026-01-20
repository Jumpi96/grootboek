export interface JournalAST {
  entries: JournalEntry[]
}

export type JournalEntry = TransactionNode | PriceNode | CommentNode

export interface TransactionNode {
  type: 'transaction'
  date: string
  description: string
  postings: PostingNode[]
  comment?: string
  lineNumber: number
}

export interface PostingNode {
  type: 'posting'
  account: string
  amount?: AmountNode
  comment?: string
  lineNumber: number
}

export interface AmountNode {
  quantity: string
  commodity: string
  isNegative: boolean
  commodityPosition: 'prefix' | 'suffix'
}

export interface PriceNode {
  type: 'price'
  date: string
  baseCommodity: string
  quoteCommodity: string
  price: string
  comment?: string
  lineNumber: number
}

export interface CommentNode {
  type: 'comment'
  text: string
  lineNumber: number
}
