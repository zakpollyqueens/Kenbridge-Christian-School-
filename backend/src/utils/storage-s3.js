const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION;
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const PUBLIC = String(process.env.S3_PUBLIC_UPLOADS || 'false').toLowerCase() === 'true';

let s3 = null;
if (S3_BUCKET && S3_REGION && (process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)) {
  s3 = new S3Client({ region: S3_REGION });
}

async function uploadBufferToS3(buffer, key, contentType = 'application/octet-stream'){
  if(!s3) throw new Error('S3 not configured');
  const command = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType });
  await s3.send(command);
  if (PUBLIC) {
    // public URL
    const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
    return { url, key };
  }
  return { key };
}

async function generateSignedUrl(key, expiresSeconds = 3600){
  if(!s3) throw new Error('S3 not configured');
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  const url = await getSignedUrl(s3, command, { expiresIn: expiresSeconds });
  return url;
}

function isConfigured(){
  return !!s3;
}

module.exports = { uploadBufferToS3, generateSignedUrl, isConfigured, PUBLIC };
