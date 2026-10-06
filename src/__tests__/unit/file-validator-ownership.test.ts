import { describe, it, expect, jest } from '@jest/globals';
import path from 'path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// The ownership check reads the real Appwrite Storage client; replace it so the
// tests can prove which stored file (and which owner) is being referenced.
const mockGetFile = jest.fn<(bucket: string, fileId: string) => Promise<unknown>>();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: { getFile: mockGetFile },
  databases: {},
  account: {},
  users: {},
  DATABASE_ID: 'freelancexchain',
  BUCKETS: {
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
    PROJECT_ATTACHMENTS: 'project-attachments',
    DISPUTE_EVIDENCE: 'dispute-evidence',
    PORTFOLIO_IMAGES: 'portfolio-images',
    MILESTONE_DELIVERABLES: 'milestone-deliverables',
  },
  Query: { equal: jest.fn(), orderDesc: jest.fn(), limit: jest.fn(), cursorAfter: jest.fn() },
  ID: { unique: jest.fn(() => 'generated-id') },
  Permission: {},
  Role: {},
  createUserClient: jest.fn(() => ({})),
}));

const importModule = async () => import('../../utils/file-validator.js');

const BUCKET = 'proposal-attachments';
const USER = 'user-123';

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    url: `/api/files/access/${BUCKET}/file-123`,
    filename: 'resume.pdf',
    size: 1024,
    mimeType: 'application/pdf',
    ...overrides,
  };
}

describe('file-validator - validateStoredAttachmentOwnership', () => {
  beforeEach(() => {
    mockGetFile.mockReset();
  });

  it('accepts an uploaded file owned by the caller', async () => {
    const { validateStoredAttachmentOwnership } = await importModule();
    mockGetFile.mockResolvedValue({ name: `${USER}_resume.pdf`, sizeOriginal: 1024, mimeType: 'application/pdf' });

    const errors = await validateStoredAttachmentOwnership([attachment()], USER, BUCKET);

    expect(errors).toEqual([]);
    expect(mockGetFile).toHaveBeenCalledWith(BUCKET, 'file-123');
  });

  it('rejects arbitrary external URLs', async () => {
    const { validateStoredAttachmentOwnership } = await importModule();

    const errors = await validateStoredAttachmentOwnership(
      [attachment({ url: 'https://evil.example.com/resume.pdf' })],
      USER,
      BUCKET,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('expected storage bucket');
    expect(mockGetFile).not.toHaveBeenCalled();
  });

  it('rejects a proxy path pointing at another bucket', async () => {
    const { validateStoredAttachmentOwnership } = await importModule();

    const errors = await validateStoredAttachmentOwnership(
      [attachment({ url: `/api/files/access/milestone-deliverables/file-123` })],
      USER,
      BUCKET,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('expected storage bucket');
    expect(mockGetFile).not.toHaveBeenCalled();
  });

  it('rejects a file uploaded by somebody else', async () => {
    const { validateStoredAttachmentOwnership } = await importModule();
    mockGetFile.mockResolvedValue({ name: 'someone-else_resume.pdf', sizeOriginal: 1024, mimeType: 'application/pdf' });

    const errors = await validateStoredAttachmentOwnership([attachment()], USER, BUCKET);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('not owned by the authenticated user');
  });

  it('rejects metadata that does not match the stored file', async () => {
    const { validateStoredAttachmentOwnership } = await importModule();
    mockGetFile.mockResolvedValue({ name: `${USER}_resume.pdf`, sizeOriginal: 999, mimeType: 'application/pdf' });

    const errors = await validateStoredAttachmentOwnership([attachment()], USER, BUCKET);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('does not match the stored file');
  });

  it('rejects a reference to a file that does not exist', async () => {
    const { validateStoredAttachmentOwnership } = await importModule();
    mockGetFile.mockRejectedValue(new Error('file not found'));

    const errors = await validateStoredAttachmentOwnership([attachment()], USER, BUCKET);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('does not exist or is inaccessible');
  });

  it('reports no errors for an empty attachment list', async () => {
    const { validateStoredAttachmentOwnership } = await importModule();

    const errors = await validateStoredAttachmentOwnership([], USER, BUCKET);

    expect(errors).toEqual([]);
    expect(mockGetFile).not.toHaveBeenCalled();
  });
});
