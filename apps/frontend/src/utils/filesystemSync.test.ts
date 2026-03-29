import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { DownloadState, uploadFilesystem, downloadFilesystem } from './filesystemSync'
import type { WebContainer, FileSystemAPI } from '@webcontainer/api'
import JSZip from 'jszip'

// Properly type the mocks
const mockReaddir = jest.fn<any>()
const mockReadFile = jest.fn<any>()
const mockMkdir = jest.fn<any>()
const mockWriteFile = jest.fn<any>()
const mockFetch = jest.fn<any>()

// Override global fetch
Object.defineProperty(global, 'fetch', {
  value: mockFetch,
  writable: true,
})

describe('filesystemSync', () => {
  let mockWebContainer: Partial<WebContainer>

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mocks
    const mockFs: Partial<FileSystemAPI> = {
      readdir: mockReaddir as any,
      readFile: mockReadFile as any,
      mkdir: mockMkdir as any,
      writeFile: mockWriteFile as any,
    }

    mockWebContainer = {
      fs: mockFs as FileSystemAPI,
    }
  })

  describe('uploadFilesystem', () => {
    it('should read files from the filesystem, request a presigned URL, then PUT the zip to it', async () => {
      const mockFiles = [
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
        { name: 'subdirfile.txt', isFile: () => true, isDirectory: () => false },
      ]

      mockReaddir.mockResolvedValue(mockFiles)
      mockReadFile
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
        .mockResolvedValueOnce(new Uint8Array([4, 5, 6]))

      const mockPresignResponse = {
        ok: true,
        statusText: 'OK',
        json: jest.fn<any>().mockResolvedValue({ uploadUrl: 'http://example.com/presigned-upload' }),
      }
      const mockUploadResponse = {
        ok: true,
        statusText: 'OK',
      }
      mockFetch
        .mockResolvedValueOnce(mockPresignResponse)
        .mockResolvedValueOnce(mockUploadResponse)

      const response = await uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/upload',
        expect.objectContaining({
          method: 'POST',
        })
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/presigned-upload',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/zip',
          },
        })
      )

      expect(response).toBe(mockUploadResponse)
    })

    it('should throw an error if requesting the presigned URL fails', async () => {
      const mockFiles = [{ name: 'file.txt', isFile: () => true, isDirectory: () => false }]

      mockReaddir.mockResolvedValue(mockFiles)
      mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]))

      const mockResponse = {
        ok: false,
        statusText: 'Internal Server Error',
      }
      mockFetch.mockResolvedValue(mockResponse)

      await expect(uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')).rejects.toThrow(
        'Failed to prepare filesystem upload: Internal Server Error'
      )
    })

    it('should throw an error if the presigned URL response is missing uploadUrl', async () => {
      const mockFiles = [{ name: 'file.txt', isFile: () => true, isDirectory: () => false }]

      mockReaddir.mockResolvedValue(mockFiles)
      mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]))

      const mockResponse = {
        ok: true,
        statusText: 'OK',
        json: jest.fn<any>().mockResolvedValue({}),
      }
      mockFetch.mockResolvedValue(mockResponse)

      await expect(uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')).rejects.toThrow(
        'Failed to prepare filesystem upload: missing upload URL'
      )
    })

    it('should handle nested directories', async () => {
      const rootFiles = [{ name: 'subdir', isFile: () => false, isDirectory: () => true }]
      const subdirFiles = [{ name: 'nested.txt', isFile: () => true, isDirectory: () => false }]

      mockReaddir
        .mockResolvedValueOnce(rootFiles)
        .mockResolvedValueOnce(subdirFiles)
      mockReadFile.mockResolvedValue(new Uint8Array([7, 8, 9]))

      const mockResponse = {
        ok: true,
        statusText: 'OK',
        json: jest.fn<any>().mockResolvedValue({ uploadUrl: 'http://example.com/presigned-upload' }),
      }
      const mockUploadResponse = {
        ok: true,
        statusText: 'OK',
      }
      mockFetch
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(mockUploadResponse)

      await uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')

      expect(mockReaddir).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should include dot-files and dot-directories in the uploaded zip', async () => {
      const rootFiles = [
        { name: '.env', isFile: () => true, isDirectory: () => false },
        { name: '.config', isFile: () => false, isDirectory: () => true },
      ]
      const dotDirFiles = [{ name: '.secret', isFile: () => true, isDirectory: () => false }]

      mockReaddir
        .mockResolvedValueOnce(rootFiles)
        .mockResolvedValueOnce(dotDirFiles)
      mockReadFile
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
        .mockResolvedValueOnce(new Uint8Array([4, 5, 6]))

      const mockPresignResponse = {
        ok: true,
        statusText: 'OK',
        json: jest.fn<any>().mockResolvedValue({ uploadUrl: 'http://example.com/presigned-upload' }),
      }
      const mockUploadResponse = {
        ok: true,
        statusText: 'OK',
      }
      mockFetch
        .mockResolvedValueOnce(mockPresignResponse)
        .mockResolvedValueOnce(mockUploadResponse)

      await uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')

      const uploadCall = mockFetch.mock.calls[1]
      const uploadRequest = uploadCall[1] as { body?: Blob }
      const uploadBody = uploadRequest.body as Blob
      const uploadedZip = new JSZip()
      await uploadedZip.loadAsync(await uploadBody.arrayBuffer())

      expect(uploadedZip.file('.env')).toBeTruthy()
      expect(uploadedZip.file('.config/.secret')).toBeTruthy()
      expect(uploadedZip.folder('.config')).toBeTruthy()
    })

    it('should include symlink entries such as node_modules/.bin tools', async () => {
      const rootFiles = [{ name: 'node_modules', isFile: () => false, isDirectory: () => true }]
      const nodeModulesFiles = [{ name: '.bin', isFile: () => false, isDirectory: () => true }]
      const dotBinFiles = [
        {
          name: 'vite',
          isFile: () => false,
          isDirectory: () => false,
          isSymbolicLink: () => true,
        },
      ]

      mockReaddir
        .mockResolvedValueOnce(rootFiles)
        .mockResolvedValueOnce(nodeModulesFiles)
        .mockResolvedValueOnce(dotBinFiles)
      mockReadFile.mockResolvedValueOnce(new Uint8Array([35, 33, 47, 117, 115, 114, 47, 98, 105, 110]))

      const mockPresignResponse = {
        ok: true,
        statusText: 'OK',
        json: jest.fn<any>().mockResolvedValue({ uploadUrl: 'http://example.com/presigned-upload' }),
      }
      const mockUploadResponse = {
        ok: true,
        statusText: 'OK',
      }
      mockFetch
        .mockResolvedValueOnce(mockPresignResponse)
        .mockResolvedValueOnce(mockUploadResponse)

      await uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')

      const uploadCall = mockFetch.mock.calls[1]
      const uploadRequest = uploadCall[1] as { body?: Blob }
      const uploadBody = uploadRequest.body as Blob
      const uploadedZip = new JSZip()
      await uploadedZip.loadAsync(await uploadBody.arrayBuffer())

      expect(uploadedZip.folder('node_modules/.bin')).toBeTruthy()
      expect(uploadedZip.file('node_modules/.bin/vite')).toBeTruthy()
    })
  })

  describe('downloadFilesystem', () => {
    it('should GET a zip from the service and extract files to the filesystem', async () => {
      // Create a real zip file for testing
      const zip = new JSZip()
      zip.file('file1.txt', new Uint8Array([1, 2, 3]))
      zip.file('subdir/file2.txt', new Uint8Array([4, 5, 6]))

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const arrayBuffer = await (zipBlob as any).arrayBuffer()

      const mockBlobFn = jest.fn<any>().mockResolvedValue(arrayBuffer)
      const mockResponse = {
        ok: true,
        blob: mockBlobFn,
      }
      mockFetch.mockResolvedValue(mockResponse)
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue(undefined)

      await downloadFilesystem(mockWebContainer as WebContainer, 'http://example.com/download')

      expect(mockFetch).toHaveBeenCalledWith('http://example.com/download', {
        method: 'GET',
      })

      expect(mockWriteFile).toHaveBeenCalledWith('/file1.txt', expect.any(Uint8Array))
      expect(mockWriteFile).toHaveBeenCalledWith('/subdir/file2.txt', expect.any(Uint8Array))
    })

    it('should create parent directories as needed', async () => {
      const zip = new JSZip()
      zip.file('deep/nested/path/file.txt', new Uint8Array([1, 2, 3]))

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const arrayBuffer = await (zipBlob as any).arrayBuffer()

      const mockBlobFn = jest.fn<any>().mockResolvedValue(arrayBuffer)
      const mockResponse = {
        ok: true,
        blob: mockBlobFn,
      }
      mockFetch.mockResolvedValue(mockResponse)
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue(undefined)

      await downloadFilesystem(mockWebContainer as WebContainer, 'http://example.com/download')

      expect(mockMkdir).toHaveBeenCalledWith('/deep', { recursive: true })
      expect(mockMkdir).toHaveBeenCalledWith('/deep/nested', { recursive: true })
      expect(mockMkdir).toHaveBeenCalledWith('/deep/nested/path', { recursive: true })
    })

    it('should return Error state if the download fails', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Not Found',
        text: jest.fn<any>().mockResolvedValue('server error'),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const result = await downloadFilesystem(mockWebContainer as WebContainer, 'http://example.com/download')

      expect(result).toBe(DownloadState.Error)
    })

    it('should handle empty zip files', async () => {
      const zip = new JSZip()
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const arrayBuffer = await (zipBlob as any).arrayBuffer()

      const mockBlobFn = jest.fn<any>().mockResolvedValue(arrayBuffer)
      const mockResponse = {
        ok: true,
        blob: mockBlobFn,
      }
      mockFetch.mockResolvedValue(mockResponse)
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue(undefined)

      await downloadFilesystem(mockWebContainer as WebContainer, 'http://example.com/download')

      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('should skip directory entries in the zip', async () => {
      const zip = new JSZip()
      zip.folder('mydir')
      zip.file('mydir/file.txt', new Uint8Array([1, 2, 3]))

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const arrayBuffer = await (zipBlob as any).arrayBuffer()

      const mockBlobFn = jest.fn<any>().mockResolvedValue(arrayBuffer)
      const mockResponse = {
        ok: true,
        blob: mockBlobFn,
      }
      mockFetch.mockResolvedValue(mockResponse)
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue(undefined)

      await downloadFilesystem(mockWebContainer as WebContainer, 'http://example.com/download')

      // Should only write the file, not the directory
      expect(mockWriteFile).toHaveBeenCalledTimes(1)
    })
  })
})