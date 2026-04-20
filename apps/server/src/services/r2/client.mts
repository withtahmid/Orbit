import {
    S3Client,
    HeadObjectCommand,
    DeleteObjectCommand,
    PutObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "../../env.mjs";
import { logger } from "../../utils/logger.mjs";

const PUT_URL_TTL_SECONDS = 60 * 10; // 10 minutes to complete upload
const GET_URL_TTL_SECONDS = 60 * 15; // 15 minutes for downloads

export type R2Service = ReturnType<typeof createR2Service>;

export const createR2Service = () => {
    const endpoint = ENV.R2_ACCOUNT_ID
        ? `https://${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : "";

    const s3 = new S3Client({
        region: "auto",
        endpoint,
        credentials: {
            accessKeyId: ENV.R2_ACCESS_KEY_ID,
            secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
        },
        forcePathStyle: true,
        // R2 doesn't support the CRC32 checksum the AWS SDK adds by default
        // in v3.729+; leaving it on bakes a zero-byte checksum into presigned
        // PUT URLs and R2 rejects the real upload as a mismatch.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });

    const bucket = ENV.R2_BUCKET;

    const createPresignedPut = async (opts: { key: string }) => {
        const cmd = new PutObjectCommand({
            Bucket: bucket,
            Key: opts.key,
        });
        const url = await getSignedUrl(s3, cmd, { expiresIn: PUT_URL_TTL_SECONDS });
        return {
            url,
            expiresAt: new Date(Date.now() + PUT_URL_TTL_SECONDS * 1000),
        };
    };

    const createPresignedGet = async (key: string) => {
        const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
        const url = await getSignedUrl(s3, cmd, { expiresIn: GET_URL_TTL_SECONDS });
        return {
            url,
            expiresAt: new Date(Date.now() + GET_URL_TTL_SECONDS * 1000),
        };
    };

    const headObject = async (key: string) => {
        return s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    };

    const deleteObject = async (key: string) => {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    };

    const getObjectBuffer = async (key: string): Promise<Buffer> => {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = res.Body as NodeJS.ReadableStream | undefined;
        if (!body) throw new Error("Empty response body from R2");
        const chunks: Buffer[] = [];
        for await (const chunk of body) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    };

    const putObjectBuffer = async (key: string, body: Buffer, contentType: string) => {
        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
            })
        );
    };

    if (!bucket) {
        logger.warn("R2 service initialized with no bucket — uploads will fail until configured");
    }

    return {
        s3,
        bucket,
        createPresignedPut,
        createPresignedGet,
        headObject,
        deleteObject,
        getObjectBuffer,
        putObjectBuffer,
    };
};
