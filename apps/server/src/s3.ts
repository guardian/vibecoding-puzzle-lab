import {
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client();

function isS3NotFoundError(err: unknown): boolean {
    if (err instanceof S3ServiceException) {
        return err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404;
    }
    return false;
}

export async function objectExistsInS3(bucket: string, key: string, versionId?: string): Promise<boolean> {
    try {
        const command = new HeadObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId });
        await s3Client.send(command);
        return true;
    } catch (err) {
        if (isS3NotFoundError(err)) {
            return false;
        }
        throw err;
    }
}

export async function createPresignedUploadUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number = 300,
): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: "application/zip",
    });
    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function createPresignedDownloadUrl(
    bucket: string,
    key: string,
    versionId?: string,
    expiresInSeconds: number = 300,
): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId,
    });
    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}