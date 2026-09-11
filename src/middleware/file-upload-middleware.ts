import { Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import {
  createProjectWithAttachmentsSchema,
  submitProposalMultipartSchema,
} from './validation-middleware.js';
import type { RequestSchema, SchemaFiles } from './validation-middleware.js';
import { logger } from '../config/logger.js';
import { getRequestId, sendErrorResponse } from '../utils/response-helpers.js';

const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const MALICIOUS_MAGIC_NUMBERS: Array<{ label: string; bytes: number[] }> = [
  { label: 'PE executable', bytes: [0x4d, 0x5a] },
  { label: 'ELF executable', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { label: 'Mach-O executable', bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { label: 'Mach-O executable', bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { label: 'Mach-O executable', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { label: 'Mach-O executable', bytes: [0xce, 0xfa, 0xed, 0xfe] },
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
export const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total
export const MIN_FILE_COUNT = 1;
export const MAX_FILE_COUNT = 10;

export const ALLOWED_MIME_TYPES = {
  'application/pdf': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
  'text/plain': true,
  'text/markdown': true,
  'text/csv': true,
  'image/png': true,
  'image/jpeg': true,
  'image/jpg': true,
  'image/gif': true,
  'image/webp': true,
  'application/zip': true,
  'application/x-rar-compressed': true,
  'application/x-7z-compressed': true,
  'video/mp4': true,
  'video/webm': true,
  'video/quicktime': true,
} as const;

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xlsx', '.pptx', '.txt', '.md', '.csv',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.zip', '.rar', '.7z',
  '.mp4', '.webm', '.mov',
];

export function sanitizeFilename(filename: string): string {
  const basename = filename.replace(/^.*[\\/]/, '');

  const sanitized = basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .substring(0, 255);

  return sanitized || 'unnamed_file';
}

function hasValidExtension(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some(ext => lowerFilename.endsWith(ext));
}

/**
 * Validate file MIME type using magic number detection
 */
async function validateFileMimeType(buffer: Buffer, filename: string): Promise<{ valid: boolean; detectedType?: string; error?: string }> {
  try {
    // Special handling for text and markdown files (no magic number)
    const lower = filename.toLowerCase();
    if (lower.endsWith('.txt') || lower.endsWith('.md')) {
      const isText = buffer.slice(0, 1024).every(byte =>
        (byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13 || byte >= 128
      );
      if (isText) {
        return { valid: true, detectedType: lower.endsWith('.md') ? 'text/markdown' : 'text/plain' };
      }
    }

    const detectedType = await fileTypeFromBuffer(buffer);

    if (!detectedType) {
      // If no magic number detected, might be a text file or unsupported format
      return { valid: false, error: 'Could not detect file type' };
    }

    if (!(detectedType.mime in ALLOWED_MIME_TYPES)) {
      return {
        valid: false,
        detectedType: detectedType.mime,
        error: `File type ${detectedType.mime} is not allowed`
      };
    }

    return { valid: true, detectedType: detectedType.mime };
  } catch (error) {
    logger.error('Error validating file MIME type', { error, filename });
    return { valid: false, error: 'Failed to validate file type' };
  }
}

const storage = multer.memoryStorage();

const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (!hasValidExtension(file.originalname)) {
    const error = new Error(`File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`);
    (error as Error & { code?: string }).code = 'INVALID_FILE_TYPE';
    return cb(error);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILE_COUNT,
  },
});

/**
 * Middleware that runs multer and translates upload errors into HTTP responses.
 */
function handleMulterUpload(fieldName: string, maxFiles: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Reject upfront if Content-Length header exceeds MAX_TOTAL_SIZE to prevent memory spikes
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength, 10) > MAX_TOTAL_SIZE) {
      sendErrorResponse(res, 400, 'TOTAL_SIZE_EXCEEDED', `Total file size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit`, { requestId: getRequestId(req) });
      return;
    }

    upload.array(fieldName, maxFiles)(req, res, (err: unknown) => {
      if (!err) return next();

      // Multer and our fileFilter attach a `code` to the error (Error | MulterError).
      const uploadError = err as { code?: string; message: string };
      if (uploadError.code === 'LIMIT_FILE_SIZE') {
        sendErrorResponse(res, 400, 'FILE_TOO_LARGE', `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`, { requestId: getRequestId(req) });
        return;
      }

      if (uploadError.code === 'LIMIT_FILE_COUNT') {
        sendErrorResponse(res, 400, 'TOO_MANY_FILES', `Maximum ${maxFiles} files allowed`, { requestId: getRequestId(req) });
        return;
      }

      if (uploadError.code === 'INVALID_FILE_TYPE') {
        sendErrorResponse(res, 400, 'INVALID_FILE_TYPE', uploadError.message, { requestId: getRequestId(req) });
        return;
      }

      next(err);
    });
  };
}

type UploadValidationOptions = {
  minFiles: number;
  maxFiles: number;
  validateMagicNumbers: boolean;
};

/**
 * Respond with a "no files" error when the minimum file count requires files.
 * Returns true when a response was sent (caller should stop).
 */
function rejectMissingFiles(req: Request, res: Response, minFiles: number): boolean {
  if (minFiles <= 0) return false;
  sendErrorResponse(res, 400, 'NO_FILES_UPLOADED', `At least ${minFiles} file(s) required`, { requestId: getRequestId(req) });
  return true;
}

/**
 * Validate one file's MIME type (magic numbers) and run the antivirus scan.
 * Responds with an error and returns false when the file is rejected.
 */
async function validateAndScanFile(
  req: Request,
  res: Response,
  file: Express.Multer.File,
): Promise<boolean> {
  const validation = await validateFileMimeType(file.buffer, file.originalname);

  if (!validation.valid) {
    logger.warn('File upload rejected - invalid MIME type', {
      filename: file.originalname,
      detectedType: validation.detectedType,
      error: validation.error,
    });

    sendErrorResponse(res, 400, 'INVALID_FILE_TYPE', validation.error || 'Invalid file type detected', {
      requestId: getRequestId(req),
      details: {
        filename: file.originalname,
        detectedType: validation.detectedType,
      },
    });
    return false;
  }

  (file as Express.Multer.File & { detectedMimeType?: string | undefined }).detectedMimeType = validation.detectedType;

  const scanResult = await scanFileForViruses(file.buffer, file.originalname);
  if (!scanResult.clean) {
    logger.warn('File upload rejected - malware/threat detected', {
      filename: file.originalname,
      threat: scanResult.threat,
    });

    sendErrorResponse(res, 400, 'MALICIOUS_FILE_DETECTED', 'File failed antivirus security scan', {
      requestId: getRequestId(req),
      details: {
        filename: file.originalname,
        threat: scanResult.threat,
      },
    });
    return false;
  }

  return true;
}

/**
 * Validate and scan the uploaded files: count, total size, magic numbers,
 * and antivirus signature scan. Sanitizes filenames on success.
 */
async function validateUploadedFiles(
  req: Request,
  res: Response,
  next: NextFunction,
  options: UploadValidationOptions,
): Promise<void> {
  const { minFiles, maxFiles, validateMagicNumbers } = options;

  try {
    // Type guard: ensure files is an array, not a dictionary or other type
    const files = req.files;

    if (!files || !Array.isArray(files) || files.length === 0) {
      if (rejectMissingFiles(req, res, minFiles)) return;
      // minFiles === 0: files are optional, proceed
      next();
      return;
    }

    if (files.length < minFiles) {
      sendErrorResponse(res, 400, 'INSUFFICIENT_FILES', `At least ${minFiles} file(s) required, received ${String(files.length)}`, { requestId: getRequestId(req) });
      return;
    }

    if (files.length > maxFiles) {
      sendErrorResponse(res, 400, 'TOO_MANY_FILES', `Maximum ${maxFiles} file(s) allowed, received ${String(files.length)}`, { requestId: getRequestId(req) });
      return;
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      sendErrorResponse(res, 400, 'TOTAL_SIZE_EXCEEDED', `Total file size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit`, { requestId: getRequestId(req) });
      return;
    }

    if (validateMagicNumbers) {
      for (const file of files) {
        const accepted = await validateAndScanFile(req, res, file);
        if (!accepted) return;
      }
    }

    files.forEach(file => {
      file.originalname = sanitizeFilename(file.originalname);
    });

    logger.info('Files uploaded successfully', {
      count: Number(files.length),
      totalSize,
      filenames: files.map(f => f.originalname),
    });

    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error('File upload error', { error: message, stack });

    sendErrorResponse(res, 500, 'FILE_UPLOAD_ERROR', 'An error occurred during file upload', { requestId: getRequestId(req) });
  }
}

export function createFileUploadMiddleware(
  fieldName: string = 'files',
  options: {
    minFiles?: number;
    maxFiles?: number;
    validateMagicNumbers?: boolean;
  } = {}
) {
  const {
    minFiles = MIN_FILE_COUNT,
    maxFiles = MAX_FILE_COUNT,
    validateMagicNumbers = true,
  } = options;

  return [
    handleMulterUpload(fieldName, maxFiles),
    (req: Request, res: Response, next: NextFunction): Promise<void> =>
      validateUploadedFiles(req, res, next, { minFiles, maxFiles, validateMagicNumbers }),
  ];
}

/**
 * Read the file-upload limits from a multipart request schema's `files`
 * metadata, keeping the upload middleware and the schema in lockstep: change
 * `minItems`/`maxItems`/`fieldName` in the schema and both the spec and the
 * runtime enforcement follow. Fails loudly at module load if the metadata is
 * missing, rather than silently accepting an unconstrained upload.
 */
function fileLimitsFromSchema(schema: RequestSchema): SchemaFiles {
  const files = schema.body?.files;
  if (!files) {
    throw new Error('Multipart request schema must declare `files` metadata');
  }
  return files;
}

const proposalFileLimits = fileLimitsFromSchema(submitProposalMultipartSchema);

/**
 * Middleware for proposal attachments (1-5 files per submitProposalMultipartSchema.files)
 */
export const uploadProposalAttachments = createFileUploadMiddleware(proposalFileLimits.fieldName, {
  minFiles: proposalFileLimits.minItems,
  maxFiles: proposalFileLimits.maxItems,
  validateMagicNumbers: true,
});

const projectFileLimits = fileLimitsFromSchema(createProjectWithAttachmentsSchema);

/**
 * Middleware for project attachments (0-10 files per createProjectWithAttachmentsSchema.files)
 */
export const uploadProjectAttachments = createFileUploadMiddleware(projectFileLimits.fieldName, {
  minFiles: projectFileLimits.minItems,
  maxFiles: projectFileLimits.maxItems,
  validateMagicNumbers: true,
});

/**
 * Middleware for dispute evidence (1-10 files, more lenient for evidence)
 */
export const uploadDisputeEvidence = createFileUploadMiddleware('files', {
  minFiles: 1,
  maxFiles: 10,
  validateMagicNumbers: true,
});

/**
 * Middleware for portfolio images (1-5 files)
 */
export const uploadPortfolioImages = createFileUploadMiddleware('files', {
  minFiles: 1,
  maxFiles: 5,
  validateMagicNumbers: true,
});

/**
 * Lightweight signature-based malware scan.
 * This is a baseline defense layer and can be augmented with an external AV service.
 */
export async function scanFileForViruses(buffer: Buffer, filename: string): Promise<{ clean: boolean; threat?: string }> {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  const sampleText = sample.toString('latin1');

  if (sampleText.includes(EICAR_SIGNATURE)) {
    return { clean: false, threat: 'EICAR test signature detected' };
  }

  for (const signature of MALICIOUS_MAGIC_NUMBERS) {
    const matches = sample.length >= signature.bytes.length && signature.bytes.every((value, index) => sample[index] === value);
    if (matches) {
      return { clean: false, threat: `${signature.label} signature detected` };
    }
  }

  if (filename.toLowerCase().endsWith('.txt') && sample.includes(0x00)) {
    return { clean: false, threat: 'Binary content detected in text file' };
  }

  logger.debug('File passed antivirus signature scan', { filename, size: buffer.length });
  return { clean: true };
}
