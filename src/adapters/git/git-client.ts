import { spawn } from 'node:child_process'
import * as path from 'node:path'

export interface GitClientOptions {
  repoPath: string
  author?: {
    name: string
    email: string
  }
}

export interface GitCommitResult {
  hash: string
  message: string
}

export class GitClient {
  private readonly repoPath: string
  private readonly author?: { name: string; email: string }

  constructor(options: GitClientOptions) {
    this.repoPath = options.repoPath
    this.author = options.author
  }

  async getCurrentCommitHash(): Promise<string | null> {
    try {
      const result = await this.exec(['rev-parse', 'HEAD'])
      return result.trim()
    } catch {
      return null
    }
  }

  async getLastModifiedDate(filePath: string): Promise<Date | null> {
    try {
      const relativePath = path.relative(this.repoPath, filePath)
      const result = await this.exec(['log', '-1', '--format=%cI', '--', relativePath])
      if (result.trim()) {
        return new Date(result.trim())
      }
      return null
    } catch {
      return null
    }
  }

  async stageFile(filePath: string): Promise<void> {
    const relativePath = path.relative(this.repoPath, filePath)
    await this.exec(['add', relativePath])
  }

  async commit(message: string): Promise<GitCommitResult> {
    const args = ['commit', '-m', message]

    if (this.author) {
      args.push('--author', `${this.author.name} <${this.author.email}>`)
    }

    await this.exec(args)

    const hash = await this.getCurrentCommitHash()

    return {
      hash: hash ?? 'unknown',
      message
    }
  }

  async push(remote: string = 'origin', branch?: string): Promise<void> {
    const args = ['push', remote]
    if (branch) {
      args.push(branch)
    }
    await this.exec(args)
  }

  async isClean(): Promise<boolean> {
    const result = await this.exec(['status', '--porcelain'])
    return result.trim() === ''
  }

  async hasUncommittedChanges(filePath: string): Promise<boolean> {
    const relativePath = path.relative(this.repoPath, filePath)
    const result = await this.exec(['status', '--porcelain', relativePath])
    return result.trim() !== ''
  }

  private exec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn('git', args, {
        cwd: this.repoPath,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      process.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Git command failed: git ${args.join(' ')}\n${stderr}`))
        }
      })

      process.on('error', (err) => {
        reject(err)
      })
    })
  }
}
