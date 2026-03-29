import { WebContainer, type FileSystemAPI } from '@webcontainer/api'
import JSZip from 'jszip'

type PresignedUploadResponse = {
  uploadUrl?: string
}

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
    const fullPath = `${path}/${entry.name}`.replace(/\/+/g, '/')
    const zipPath = fullPath.replace(/^\/+/, '')
    const symbolicLinkEntry = typeof (entry as any).isSymbolicLink === 'function' ? (entry as any).isSymbolicLink() : false

    if (entry.isDirectory?.()) {
      // Explicitly keep directory entries so empty folders are preserved in the archive.
      zip.folder(zipPath)
      await addDirectoryToZip(fs, zip, fullPath)
    } else if (entry.isFile?.() || symbolicLinkEntry) {
      // Many package-manager bins are symlinks (for example node_modules/.bin/*).
      const content = await fs.readFile(fullPath)
      zip.file(zipPath, content)
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

  // Ask the API for a short-lived presigned PUT URL.
  const presignResponse = await fetch(serviceUrl, {
    method: 'POST',
  })

  if (!presignResponse.ok) {
    throw new Error(`Failed to prepare filesystem upload: ${presignResponse.statusText}`)
  }

  const { uploadUrl } = (await presignResponse.json()) as PresignedUploadResponse
  if (!uploadUrl) {
    throw new Error('Failed to prepare filesystem upload: missing upload URL')
  }

  // Upload the zip directly to S3.
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/zip',
    },
    body: zipBlob,
  })

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload filesystem: ${uploadResponse.statusText}`)
  }

  return uploadResponse
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
