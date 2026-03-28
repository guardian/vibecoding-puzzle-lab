import { WebContainer, type FileSystemAPI } from '@webcontainer/api'
import JSZip from 'jszip'

/**
 * Recursively adds files from a directory to a zip, processing one file at a time
 */
async function addDirectoryToZip(
  fs: FileSystemAPI,
  zip: JSZip,
  path: string
): Promise<void> {
  const entries = await fs.readdir(path, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = `${path}/${entry.name}`.replace(/^\//, '')

    if (entry.isDirectory?.()) {
      await addDirectoryToZip(fs, zip, fullPath)
    } else if (entry.isFile?.()) {
      const content = await fs.readFile(fullPath)
      zip.file(fullPath, content)
    }
  }
}

/**
 * Zips the contents of the WebContainer's filesystem and POSTs it to a webservice
 * @param webContainer - The WebContainer instance
 * @param serviceUrl - The URL endpoint to POST the zip to
 * @param sourceDir - The directory to zip (default: '/')
 * @returns Promise resolving to the server response
 */
export async function uploadFilesystem(
  webContainer: WebContainer,
  serviceUrl: string,
  sourceDir: string = '/'
): Promise<Response> {
  const fs = webContainer.fs

  // Create a new zip file
  const zip = new JSZip()

  // Add files to the zip one at a time
  await addDirectoryToZip(fs, zip, sourceDir)

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

export enum DownloadState {
  Downloaded = "downloaded",
  NotFound = "not_found",
  Error = "error",
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
): Promise<DownloadState> {
  const fs = webContainer.fs

  // GET the zip from the webservice
  const response = await fetch(serviceUrl, {
    method: 'GET',
  })

  if(response.status === 404) return DownloadState.NotFound;
  if (!response.ok) {
    const content = await response.text();
    console.error(`Failed to download filesystem: ${response.status}`, content);
    return DownloadState.Error;
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
  return DownloadState.Downloaded;
}
