import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { uploadFilesystem, downloadFilesystem } from './filesystemSync'
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
    it('should read files from the filesystem and POST a zip to the service', async () => {
      const mockFiles = [
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
        { name: 'subdirfile.txt', isFile: () => true, isDirectory: () => false },
      ]

      mockReaddir.mockResolvedValue(mockFiles)
      mockReadFile
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
        .mockResolvedValueOnce(new Uint8Array([4, 5, 6]))

      const mockResponse = {
        ok: true,
        statusText: 'OK',
      }
      mockFetch.mockResolvedValue(mockResponse)

      const response = await uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/upload',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/zip',
          },
        })
      )

      expect(response).toBe(mockResponse)
    })

    it('should throw an error if the upload fails', async () => {
      const mockFiles = [{ name: 'file.txt', isFile: () => true, isDirectory: () => false }]

      mockReaddir.mockResolvedValue(mockFiles)
      mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]))

      const mockResponse = {
        ok: false,
        statusText: 'Internal Server Error',
      }
      mockFetch.mockResolvedValue(mockResponse)

      await expect(uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')).rejects.toThrow(
        'Failed to upload filesystem: Internal Server Error'
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
      }
      mockFetch.mockResolvedValue(mockResponse)

      await uploadFilesystem(mockWebContainer as WebContainer, 'http://example.com/upload')

      expect(mockReaddir).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenCalled()
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

    it('should throw an error if the download fails', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Not Found',
      }
      mockFetch.mockResolvedValue(mockResponse)

      await expect(downloadFilesystem(mockWebContainer as WebContainer, 'http://example.com/download')).rejects.toThrow(
        'Failed to download filesystem: Not Found'
      )
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