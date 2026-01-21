/**
 * Abstract file system provider.
 * Implement this interface for different environments (Node.js, browser, etc.)
 */
export interface FileProvider {
  /**
   * Read file contents as string
   * @returns File contents, or empty string if file doesn't exist
   */
  read(path: string): Promise<string>

  /**
   * Write string contents to file
   */
  write(path: string, content: string): Promise<void>

  /**
   * Get file metadata
   */
  stat(path: string): Promise<{ lastModified: Date } | null>
}

/**
 * Node.js file system provider
 */
export class NodeFileProvider implements FileProvider {
  private fs: typeof import('node:fs/promises') | null = null

  private async getFs() {
    if (!this.fs) {
      this.fs = await import('node:fs/promises')
    }
    return this.fs
  }

  async read(path: string): Promise<string> {
    const fs = await this.getFs()
    try {
      return await fs.readFile(path, 'utf-8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return ''
      }
      throw e
    }
  }

  async write(path: string, content: string): Promise<void> {
    const fs = await this.getFs()
    // Write to temp file first, then rename (atomic)
    const tempPath = `${path}.tmp`
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, path)
  }

  async stat(path: string): Promise<{ lastModified: Date } | null> {
    const fs = await this.getFs()
    try {
      const stats = await fs.stat(path)
      return { lastModified: stats.mtime }
    } catch {
      return null
    }
  }
}

/**
 * In-memory file provider (useful for testing or browser without persistence)
 */
export class InMemoryFileProvider implements FileProvider {
  private files = new Map<string, { content: string; lastModified: Date }>()

  async read(path: string): Promise<string> {
    return this.files.get(path)?.content ?? ''
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, { content, lastModified: new Date() })
  }

  async stat(path: string): Promise<{ lastModified: Date } | null> {
    const file = this.files.get(path)
    return file ? { lastModified: file.lastModified } : null
  }

  // Helper for testing
  clear(): void {
    this.files.clear()
  }
}
