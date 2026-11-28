import type { ContractRouterClient } from '@orpc/contract'
import type { Contract, FilePurpose } from '@vento/shared'
import type { PartTransport } from './put-part'
import type { UploadClock, UploadNetwork } from './upload-retry'

type Files = ContractRouterClient<Contract>['files']
type Call<K extends keyof Files> = (
  input: Parameters<Files[K]>[0],
  options?: { signal?: AbortSignal },
) => Promise<Awaited<ReturnType<Files[K]>>>
/** `client.files`, or a fake in tests. */
export type UploadApi = { [K in keyof Files]: Call<K> }
export type UploadPhase = 'checking' | 'uploading' | 'paused'

export type MultipartUploadOptions = {
  purpose: FilePurpose
  api: UploadApi
  transport?: PartTransport
  clock?: UploadClock
  network?: UploadNetwork
  random?: () => number
  concurrency?: number
  onPhase?(phase: UploadPhase): void
  onProgress?(loaded: number, total: number): void
}
