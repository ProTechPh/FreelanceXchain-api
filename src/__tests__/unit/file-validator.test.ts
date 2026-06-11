import { describe, it, expect } from '@jest/globals';
import {
  validateAttachments,
  isFileAttachment,
  hasValidExtension,
  isAllowedMimeType,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FILE_COUNT,
} from '../../utils/file-validator.js';

const validStorageUrl = 'https://abc.appwrite.co/storage/v1/object/public/uploads/file.pdf';

function makeAttachment(overrides: Record<string, unknown> = {}) {
  return {
    url: validStorageUrl,
    filename: 'document.pdf',
    size: 1024,
    mimeType: 'application/pdf',
    ...overrides,
  };
}

describe('file-validator', () => {
  describe('validateAttachments', () => {
    it('should return no errors for a valid single attachment', () => {
      const errors = validateAttachments([makeAttachment()]);
      expect(errors).toHaveLength(0);
    });

    it('should return error when attachments is not an array', () => {
      const errors = validateAttachments('not-an-array');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('must be an array');
    });

    it('should return error when attachment count exceeds max', () => {
      const attachments = Array.from({ length: MAX_FILE_COUNT + 1 }, () => makeAttachment());
      const errors = validateAttachments(attachments);
      expect(errors.some(e => e.message.includes('Maximum'))).toBe(true);
    });

    it('should return error when minFiles constraint is not met', () => {
      const errors = validateAttachments([], { minFiles: 1 });
      expect(errors.some(e => e.message.includes('required'))).toBe(true);
    });

    it('should return error when total size exceeds limit', () => {
      const bigAttachment = makeAttachment({ size: MAX_TOTAL_SIZE + 1 });
      const errors = validateAttachments([bigAttachment]);
      expect(errors.some(e => e.message.includes('Total file size'))).toBe(true);
    });

    it('should return error for attachment that is not an object', () => {
      const errors = validateAttachments(['not-an-object']);
      expect(errors.some(e => e.message.includes('must be an object'))).toBe(true);
    });

    it('should return error for null attachment', () => {
      const errors = validateAttachments([null]);
      expect(errors.some(e => e.message.includes('must be an object'))).toBe(true);
    });

    it('should return error when url is missing', () => {
      const errors = validateAttachments([makeAttachment({ url: '' })]);
      expect(errors.some(e => e.field.includes('.url'))).toBe(true);
    });

    it('should return error when url is not a string', () => {
      const errors = validateAttachments([makeAttachment({ url: 123 })]);
      expect(errors.some(e => e.field.includes('.url'))).toBe(true);
    });

    it('should return error when url is not from Appwrite Storage', () => {
      const errors = validateAttachments([makeAttachment({ url: 'ftp://abc.appwrite.co/storage/v1/object/file.pdf' })]);
      expect(errors.some(e => e.field.includes('.url'))).toBe(true);
    });

    it('should accept HTTP file URLs as valid protocol', () => {
      const errors = validateAttachments([makeAttachment({ url: 'http://abc.appwrite.co/storage/v1/object/file.pdf' })]);
      expect(errors.some(e => e.field.includes('.url') && e.message.includes('HTTP'))).toBe(false);
    });

    it('should accept valid HTTPS URL without /storage/ path', () => {
      const errors = validateAttachments([makeAttachment({ url: 'https://abc.appwrite.co/public/file.pdf' })]);
      expect(errors.some(e => e.field.includes('.url') && e.message.includes('HTTPS'))).toBe(false);
    });

    it('should return error for completely invalid URL', () => {
      const errors = validateAttachments([makeAttachment({ url: 'not-a-url' })]);
      expect(errors.some(e => e.field.includes('.url'))).toBe(true);
    });

    it('should return error when filename is missing', () => {
      const errors = validateAttachments([makeAttachment({ filename: '' })]);
      expect(errors.some(e => e.field.includes('.filename'))).toBe(true);
    });

    it('should return error when filename is not a string', () => {
      const errors = validateAttachments([makeAttachment({ filename: 123 })]);
      expect(errors.some(e => e.field.includes('.filename'))).toBe(true);
    });

    it('should return error when filename has invalid extension', () => {
      const errors = validateAttachments([makeAttachment({ filename: 'file.exe' })]);
      expect(errors.some(e => e.field.includes('.filename') && e.message.includes('not allowed'))).toBe(true);
    });

    it('should return error when size is not a positive number', () => {
      const errors = validateAttachments([makeAttachment({ size: 0 })]);
      expect(errors.some(e => e.field.includes('.size'))).toBe(true);
    });

    it('should return error when size is negative', () => {
      const errors = validateAttachments([makeAttachment({ size: -100 })]);
      expect(errors.some(e => e.field.includes('.size'))).toBe(true);
    });

    it('should return error when size exceeds MAX_FILE_SIZE', () => {
      const errors = validateAttachments([makeAttachment({ size: MAX_FILE_SIZE + 1 })]);
      expect(errors.some(e => e.field.includes('.size') && e.message.includes('exceeds'))).toBe(true);
    });

    it('should return error when mimeType is missing', () => {
      const errors = validateAttachments([makeAttachment({ mimeType: '' })]);
      expect(errors.some(e => e.field.includes('.mimeType'))).toBe(true);
    });

    it('should return error when mimeType is not a string', () => {
      const errors = validateAttachments([makeAttachment({ mimeType: 42 })]);
      expect(errors.some(e => e.field.includes('.mimeType'))).toBe(true);
    });

    it('should return error for disallowed MIME type', () => {
      const errors = validateAttachments([makeAttachment({ mimeType: 'application/x-msdownload' })]);
      expect(errors.some(e => e.field.includes('.mimeType') && e.message.includes('not allowed'))).toBe(true);
    });

    it('should validate all MIME types that are explicitly allowed', () => {
      for (const mimeType of ALLOWED_MIME_TYPES) {
        const ext = mimeType === 'application/pdf' ? '.pdf'
          : mimeType === 'application/msword' ? '.doc'
          : mimeType.includes('wordprocessingml') ? '.docx'
          : mimeType === 'text/plain' ? '.txt'
          : mimeType === 'image/png' ? '.png'
          : mimeType === 'image/jpeg' ? '.jpg'
          : mimeType === 'image/gif' ? '.gif'
          : '.pdf';
        const errors = validateAttachments([makeAttachment({ mimeType, filename: `file${ext}` })]);
        const mimeErrors = errors.filter(e => e.field.includes('.mimeType'));
        expect(mimeErrors).toHaveLength(0);
      }
    });

    it('should use custom maxFiles option', () => {
      const attachments = [makeAttachment(), makeAttachment()];
      const errors = validateAttachments(attachments, { maxFiles: 1 });
      expect(errors.some(e => e.message.includes('Maximum'))).toBe(true);
    });

    it('should use custom maxTotalSize option', () => {
      const attachment = makeAttachment({ size: 500 });
      const errors = validateAttachments([attachment], { maxTotalSize: 100 });
      expect(errors.some(e => e.message.includes('Total file size'))).toBe(true);
    });

    it('should return no errors for an empty array', () => {
      const errors = validateAttachments([]);
      expect(errors).toHaveLength(0);
    });

    it('should accumulate errors across multiple attachments', () => {
      const bad1 = makeAttachment({ url: 'not-a-url' });
      const bad2 = makeAttachment({ mimeType: 'bad/type', filename: 'file.xyz' });
      const errors = validateAttachments([bad1, bad2]);
      expect(errors.length).toBeGreaterThan(1);
    });
  });

  describe('isFileAttachment', () => {
    it('should return true for a valid attachment object', () => {
      expect(isFileAttachment(makeAttachment())).toBe(true);
    });

    it('should return false for null', () => {
      expect(isFileAttachment(null)).toBe(false);
    });

    it('should return false for a string', () => {
      expect(isFileAttachment('string')).toBe(false);
    });

    it('should return false when url is missing', () => {
      expect(isFileAttachment({ filename: 'a.pdf', size: 1, mimeType: 'application/pdf' })).toBe(false);
    });

    it('should return false when filename is not a string', () => {
      expect(isFileAttachment({ url: 'https://x.appwrite.co/storage/v1/object/x', filename: 42, size: 1, mimeType: 'application/pdf' })).toBe(false);
    });

    it('should return false when size is not a number', () => {
      expect(isFileAttachment({ url: 'https://x.appwrite.co/storage/v1/object/x', filename: 'f.pdf', size: '1kb', mimeType: 'application/pdf' })).toBe(false);
    });

    it('should return false when mimeType is not a string', () => {
      expect(isFileAttachment({ url: 'https://x.appwrite.co/storage/v1/object/x', filename: 'f.pdf', size: 1024, mimeType: null })).toBe(false);
    });
  });

  describe('hasValidExtension', () => {
    it('should return true for allowed extensions', () => {
      for (const ext of ALLOWED_EXTENSIONS) {
        expect(hasValidExtension(`file${ext}`)).toBe(true);
      }
    });

    it('should return false for disallowed extension', () => {
      expect(hasValidExtension('file.exe')).toBe(false);
      expect(hasValidExtension('file.bat')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(hasValidExtension('file.PDF')).toBe(true);
      expect(hasValidExtension('file.PNG')).toBe(true);
    });

    it('should return false for no extension', () => {
      expect(hasValidExtension('filename')).toBe(false);
    });
  });

  describe('isAllowedMimeType', () => {
    it('should return true for all allowed MIME types', () => {
      for (const mime of ALLOWED_MIME_TYPES) {
        expect(isAllowedMimeType(mime)).toBe(true);
      }
    });

    it('should return false for disallowed MIME types', () => {
      expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
      expect(isAllowedMimeType('application/x-bat')).toBe(false);
      expect(isAllowedMimeType('application/x-unknown')).toBe(false);
    });
  });
});
