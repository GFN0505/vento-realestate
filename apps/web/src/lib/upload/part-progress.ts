/** Bytes up so far: whole parts the bucket confirmed, plus what's sent of parts still going. */
export class PartProgress {
  private readonly sending = new Map<number, number>()
  partSize = 0

  constructor(
    private readonly fileSize: number,
    private readonly confirmed: () => Iterable<number>,
    private readonly onProgress?: (loaded: number, total: number) => void,
  ) {}

  /** `loaded` bytes of part `n` are sent; its request is still open. */
  moved(n: number, loaded: number): void {
    this.sending.set(n, Math.min(loaded, this.bytesOf(n)))
    this.report()
  }

  /** Part `n`'s request ended, sent or not; reports the new total. */
  ended(n: number): void {
    this.sending.delete(n)
    this.report()
  }

  clear(): void {
    this.sending.clear()
    this.report()
  }

  report(): void {
    let loaded = 0
    for (const n of this.confirmed()) loaded += this.bytesOf(n)
    for (const bytes of this.sending.values()) loaded += bytes
    this.onProgress?.(loaded, this.fileSize)
  }

  private bytesOf(n: number): number {
    return Math.min(this.partSize, this.fileSize - (n - 1) * this.partSize)
  }
}
