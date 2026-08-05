import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { setupWebContainer, createWebContainerRuntimeState } from './webcontainer'
import { DownloadState, downloadFilesystem } from './filesystemSync'

type ServerReadyListener = (port: number, url: string) => void

const mockFsReadFile = jest.fn<any>()
const mockFsWriteFile = jest.fn<any>()
const mockSpawn = jest.fn<any>()
const mockDownloadFilesystem = downloadFilesystem as jest.MockedFunction<typeof downloadFilesystem>

jest.mock('./filesystemSync', () => ({
  ...(jest.requireActual('./filesystemSync') as object),
  downloadFilesystem: jest.fn(),
}))

jest.mock('@webcontainer/api', () => {
  class MockWebContainer {
    static async boot() {
      return mockContainer
    }
  }

  return {
    WebContainer: MockWebContainer,
  }
}, { virtual: true })

let serverReadyListener: ServerReadyListener | null = null
let exitResolve: ((code: number) => void) | null = null

const mockContainer = {
  fs: {
    readFile: mockFsReadFile,
    writeFile: mockFsWriteFile,
  },
  on: jest.fn((event: string, cb: ServerReadyListener) => {
    if (event === 'server-ready') {
      serverReadyListener = cb
    }
    return jest.fn()
  }),
  spawn: mockSpawn,
  teardown: jest.fn(),
} as any

function createMockProcess() {
  const output = {
    getReader: () => ({
      read: async () => ({ done: true, value: '' }),
      releaseLock: jest.fn(),
    }),
  }

  const exit = new Promise<number>((resolve) => {
    exitResolve = resolve
  })

  return {
    output,
    exit,
  }
}

async function waitForServerReadyListener() {
  for (let i = 0; i < 50; i += 1) {
    if (serverReadyListener) {
      return serverReadyListener
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  }

  throw new Error('Timed out waiting for server-ready listener registration')
}

describe('setupWebContainer dev-server crash detection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    serverReadyListener = null
    exitResolve = null
    mockFsReadFile.mockResolvedValue('existing file')
    mockFsWriteFile.mockResolvedValue(undefined)
    mockDownloadFilesystem.mockResolvedValue(DownloadState.NotFound)
    mockSpawn.mockResolvedValue(createMockProcess())
  })

  it('reports non-zero dev-server exit after ready via onDevServerExit', async () => {
    const runtime = createWebContainerRuntimeState()
    const onLog = jest.fn<(line: string) => void>()
    const onCodeLoaded = jest.fn<(code: string) => void>()
    const onDevServerExit = jest.fn<(exitCode: number) => void>()

    const setupPromise = setupWebContainer(
      runtime,
      'bundle-id',
      'export default function App() { return null }',
      onCodeLoaded,
      onLog,
      undefined,
      undefined,
      onDevServerExit,
    )

    const readyListener = await waitForServerReadyListener()
    readyListener(5173, 'https://preview.example')
    const result = await setupPromise

    expect(result.previewUrl).toBe('https://preview.example')
    expect(runtime.meta.previewUrl).toBe('https://preview.example')
    expect(onDevServerExit).not.toHaveBeenCalled()

    exitResolve?.(1)
    await Promise.resolve()

    expect(onDevServerExit).toHaveBeenCalledWith(1)
    expect(runtime.meta.previewUrl).toBeNull()
    expect(runtime.handles.devServerProcess).toBeNull()
    expect(runtime.handles.devServerStart).toBeNull()
    expect(onLog).toHaveBeenCalledWith('[system] dev server exited with code 1')
  })
})
