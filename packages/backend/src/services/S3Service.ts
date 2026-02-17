import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3ObjectInfo {
  key: string;
  size: number;
  lastModified: Date | null;
}

export class S3Service {
  private client: S3Client;
  private presignClient: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || 'screenshots';
    const endpoint = process.env.AWS_S3_ENDPOINT;
    const publicEndpoint = process.env.AWS_S3_PUBLIC_ENDPOINT;
    const region = process.env.AWS_S3_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY || '';
    const forcePathStyle = process.env.AWS_S3_FORCE_PATH_STYLE === 'true';
    
    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle,
    });

    this.presignClient = publicEndpoint
      ? new S3Client({
          endpoint: publicEndpoint,
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
          forcePathStyle,
        })
      : this.client;
  }

  async uploadFile(key: string, body: Buffer, contentType: string = 'application/octet-stream'): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    }));

    return `s3://${this.bucket}/${key}`;
  }

  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    return await getSignedUrl(this.presignClient, command, { expiresIn });
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    }));
  }

  async listFiles(prefix: string): Promise<S3ObjectInfo[]> {
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    }));

    return (response.Contents || [])
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.Key))
      .map((item) => ({
        key: item.Key as string,
        size: item.Size || 0,
        lastModified: item.LastModified || null,
      }));
  }

  getBucketName(): string {
    return this.bucket;
  }

  extractKeyFromUrl(url: string): string | null {
    const match = url.match(/s3:\/\/[^/]+\/(.+)/);
    return match ? match[1] : null;
  }
}

export const s3Service = new S3Service();
