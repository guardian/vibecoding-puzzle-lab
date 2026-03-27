import { WebContainer, type FileSystemAPI } from '@webcontainer/api'
import JSZip from 'jszip'

/**
 * Recursively reads all files from a directory in the WebContainer filesystem
 */
async function readDirectoryRecursive(
  fs: FileSystemAPI,
  path: string
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const entries = await fs.readdir(path, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = `${path}/${entry.name}`.replace(/^\//, '')

    if (entry.isDirectory?.()) {
      const subFiles = await readDirectoryRecursive(fs, fullPath)
      for (const [subPath, content] of subFiles) {
        files.set(subPath, content)
      }
    } else if (entry.isFile?.()) {
      const content = await fs.readFile(fullPath)
      files.set(fullPath, content)
    }
  }

  return files
}

/**
 * Zips the contents of the WebContainer's filesystem and POSTs it to a webservice
 * @param webContainer - The WebContainer instance
 * @param sourceDir - The directory to zip (default: '/')
 * @param serviceUrl - The URL endpoint to POST the zip to
 * @returns Promise resolving to the server response
 */
export async function uploadFilesystem(
  webContainer: WebContainer,
  serviceUrl: string,
  sourceDir: string = '/'
): Promise<Response> {
  const fs = webContainer.fs

  // Read all files from the directory
  const files = await readDirectoryRecursive(fs, sourceDir)

  // Create a new zip file
  const zip = new JSZip()

  // Add all files to the zip
  for (const [filePath, content] of files) {
    zip.file(filePath, content)
  }

  // Generate the zip file as a blob
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  // POST the zip to the webservice
  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
    },
    body: zipBlob,
  })

  if (!response.ok) {
    throw new Error(`Failed to upload filesystem: ${response.statusText}`)
  }

  return response
}

/**
 * GETs a zip file from a webservice and unzips it into the WebContainer's filesystem
 * @param webContainer - The WebContainer instance
 * @param serviceUrl - The URL endpoint to GET the zip from
 * @param targetDir - The directory to unzip into (default: '/')
 * @returns Promise resolving when unzip is complete
 */
export async function downloadFilesystem(
  webContainer: WebContainer,
  serviceUrl: string,
  targetDir: string = '/'
): Promise<void> {
  const fs = webContainer.fs

  // GET the zip from the webservice
  const response = await fetch(serviceUrl, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Failed to download filesystem: ${response.statusText}`)
  }

  const zipBlob = await response.blob()

  // Parse the zip file
  const zip = new JSZip()
  await zip.loadAsync(zipBlob)

  // Extract all files to the filesystem
  for (const [path, file] of Object.entries(zip.files)) {
    // Skip directories
    if (file.dir) continue

    // Get the file content as bytes
    const content = await file.async('uint8array')

    // Construct the target path
    const targetPath = `${targetDir}/${path}`.replace(/\/+/g, '/').replace(/^\//, '')

    // Create parent directories if needed
    const pathParts = targetPath.split('/')
    for (let i = 1; i < pathParts.length; i++) {
      const dirPath = '/' + pathParts.slice(0, i).join('/')
      try {
        await fs.mkdir(dirPath, { recursive: true })
      } catch (error) {
        // Directory might already exist, ignore error
      }
    }

    // Write the file
    await fs.writeFile('/' + targetPath, content)
  }
}
