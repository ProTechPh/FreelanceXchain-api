import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock Supabase config
jest.unstable_mockModule(resolveModule('src/config/supabase.ts'), () => ({
  getSupabaseServiceClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(async () => ({ data: { path: 'test/path' }, error: null })),
        remove: jest.fn(async () => ({ data: null, error: null })),
        createSignedUrl: jest.fn(async () => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'https://example.com/public' } })),
      })),
    },
  })),
  getSupabaseClient: jest.fn(() => ({})),
  createPerRequestClient: jest.fn(() => ({})),
  initializeDatabase: jest.fn(async () => {}),
  TABLES: {
    USERS: 'users',
    FREELANCER_PROFILES: 'freelancer_profiles',
    EMPLOYER_PROFILES: 'employer_profiles',
    PROJECTS: 'projects',
    PROPOSALS: 'proposals',
    CONTRACTS: 'contracts',
    DISPUTES: 'disputes',
    SKILLS: 'skills',
    SKILL_CATEGORIES: 'skill_categories',
    NOTIFICATIONS: 'notifications',
    KYC_VERIFICATIONS: 'kyc_verifications',
    REVIEWS: 'reviews',
    MESSAGES: 'messages',
    PAYMENTS: 'payments',
    AUDIT_LOG_ENTRIES: 'audit_log_entries',
  },
  STORAGE_BUCKETS: {
    PROPOSAL_ATTACHMENTS: 'proposal-attachments',
    PROJECT_ATTACHMENTS: 'project-attachments',
    DISPUTE_EVIDENCE: 'dispute-evidence',
    MILESTONE_DELIVERABLES: 'milestone-deliverables',
    PROFILE_IMAGES: 'profile-images',
  },
}));

// Mock the auth-middleware to bypass authentication
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer test-token-')) {
      req.user = { id: authHeader.slice(18), userId: authHeader.slice(18), email: 'test@example.com', role: 'freelancer' };
    }
    next();
  },
  requireRole: (_role: string) => (req: any, res: any, next: any) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'AUTH_UNAUTHORIZED', message: 'Authentication required' }, timestamp: new Date().toISOString(), requestId: 'test' });
      return;
    }
    next();
  },
  requireVerifiedKyc: (req: any, res: any, next: any) => {
    next();
  },
}));

// Mock rate limiter middleware
jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  rateLimiter: jest.fn(() => (req: any, res: any, next: any) => next()),
  apiRateLimiter: (req: any, res: any, next: any) => next(),
  fileUploadRateLimiter: (req: any, res: any, next: any) => next(),
  loginRateLimiter: (req: any, res: any, next: any) => next(),
  registerRateLimiter: (req: any, res: any, next: any) => next(),
  passwordResetRateLimiter: (req: any, res: any, next: any) => next(),
  authRateLimiter: (req: any, res: any, next: any) => next(),
  sensitiveRateLimiter: (req: any, res: any, next: any) => next(),
  withdrawalRateLimiter: (req: any, res: any, next: any) => next(),
}));

// Mock file upload middleware - use multer to handle actual file uploads
const multerModule = await import('multer');
const multer = multerModule.default;
const upload = multer({ storage: multer.memoryStorage() });

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  createFileUploadMiddleware: jest.fn((fieldName: string, options?: any) => {
    return [upload.array(fieldName, options?.maxFiles || 10)];
  }),
  uploadProposalAttachments: [upload.array('files', 10)],
  uploadProjectAttachments: [upload.array('files', 10)],
  uploadDisputeEvidence: [upload.array('files', 10)],
  uploadPortfolioImages: [upload.array('files', 10)],
  sanitizeFilename: jest.fn((filename: string) => filename),
  scanFileForViruses: jest.fn(async () => ({ clean: true })),
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  MAX_TOTAL_SIZE: 25 * 1024 * 1024,
  MIN_FILE_COUNT: 1,
  MAX_FILE_COUNT: 10,
  ALLOWED_MIME_TYPES: {},
}));

// Mock validation middleware
jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: () => (req: any, res: any, next: any) => next(),
  validate: () => (req: any, res: any, next: any) => next(),
  validateRequest: jest.fn((req: any, res: any, next: any) => next()),
  isValidUUID: jest.fn((value: string) => true),
}));

// Mock milestone service
jest.unstable_mockModule(resolveModule('src/services/milestone-service.ts'), () => ({
  getMilestoneById: jest.fn(async (milestoneId: string) => ({
    success: true,
    data: {
      id: milestoneId,
      contractId: 'mock-contract-id',
      title: 'Test Milestone',
      description: 'Test milestone description',
      amount: 1000,
      dueDate: new Date('2026-12-31'),
      status: 'pending',
      deliverableFiles: [],
      revisionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })),
  submitMilestone: jest.fn(async (input: any) => ({
    success: true,
    data: {
      id: input.milestoneId,
      contractId: 'mock-contract-id',
      title: 'Test Milestone',
      description: 'Test milestone description',
      amount: 1000,
      dueDate: new Date('2026-12-31'),
      status: 'submitted',
      submittedAt: new Date(),
      deliverableFiles: input.deliverables,
      revisionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })),
  approveMilestone: jest.fn(async (input: any) => ({
    success: true,
    data: {
      id: input.milestoneId,
      status: 'approved',
    },
  })),
  rejectMilestone: jest.fn(async (input: any) => ({
    success: true,
    data: {
      id: input.milestoneId,
      status: 'rejected',
    },
  })),
  getContractMilestones: jest.fn(async (contractId: string) => ({
    success: true,
    data: [],
  })),
}));

// Mock file upload utility
jest.unstable_mockModule(resolveModule('src/utils/file-upload.ts'), () => ({
  uploadFile: jest.fn(async (options: any) => ({
    success: true,
    url: `https://example.supabase.co/storage/v1/object/public/milestone-deliverables/${options.userId}/${options.folder}/${options.filename}`,
    path: `${options.userId}/${options.folder}/${options.filename}`,
  })),
  deleteFile: jest.fn(async (bucket: string, path: string) => ({
    success: true,
  })),
  getSignedUrl: jest.fn(async (bucket: string, path: string, expiresIn?: number) => ({
    success: true,
    url: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}`,
  })),
  listUserFiles: jest.fn(async (bucket: string, userId: string, folder?: string) => ({
    success: true,
    files: [],
  })),
}));

// Mock storage uploader utility
jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadFileToStorage: jest.fn(async (file: any, bucket: string, metadata: any) => ({
    success: true,
    url: `https://example.supabase.co/storage/v1/object/public/${bucket}/${metadata.userId}/${file.originalname}`,
    path: `${metadata.userId}/${file.originalname}`,
  })),
  uploadMultipleFiles: jest.fn(async (files: any[], bucket: string, metadata: any) => ({
    success: true,
    files: files.map(f => ({
      url: `https://example.supabase.co/storage/v1/object/public/${bucket}/${metadata.userId}/${f.originalname}`,
      path: `${metadata.userId}/${f.originalname}`,
      filename: f.originalname,
    })),
  })),
  deleteFileFromStorage: jest.fn(async (bucket: string, path: string) => ({
    success: true,
  })),
  extractFilePathFromUrl: jest.fn((url: string) => 'test/path'),
  cleanupUploadedFiles: jest.fn(async (urls: string[]) => ({ success: true })),
}));

// Dynamically import everything after the mock is set up
let request: any, createApp: any, generateId: any, fs: any;

beforeAll(async () => {
  request = (await import('supertest')).default;
  const appModule = await import('../../app.js');
  createApp = appModule.createApp;
  ({ generateId } = await import('../../utils/id.js'));
  fs = await import('fs');
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Milestone Attachments API', () => {
  let app: any;
  let authToken: string;
  let freelancerId: string;
  let milestoneId: string;

  beforeAll(async () => {
    app = await createApp();
    freelancerId = generateId();
    milestoneId = generateId();
    authToken = 'Bearer test-token-' + freelancerId;
  });

  describe('POST /api/milestones/:id/upload-deliverables', () => {
    it('should upload deliverable files for milestone', async () => {
      // Create test file
      const testFilePath = path.join(__dirname, 'test-deliverable.pdf');
      const testFileContent = Buffer.from('JVBERi0xLjQKJcOkw7zDtsO8CjIgMCBvYmoKPDwKL0xlbmd0aCAzIDAgUgo+PgpzdHJlYW0KQNC4xOTk5Cg==', 'base64');
      fs.writeFileSync(testFilePath, testFileContent);

      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/upload-deliverables`)
        .set('Authorization', authToken)
        .attach('files', testFilePath)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Successfully uploaded 1 file(s)',
      });

      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0]).toMatchObject({
        filename: 'test-deliverable.pdf',
        mimeType: 'application/pdf',
      });
      expect(response.body.files[0].url).toContain('milestone-deliverables');

      // Clean up test file
      fs.unlinkSync(testFilePath);
    });

    it('should upload multiple deliverable files', async () => {
      // Create test files
      const testPdfPath = path.join(__dirname, 'test-document.pdf');
      const testImagePath = path.join(__dirname, 'test-screenshot.png');
      
      const testPdfContent = Buffer.from('JVBERi0xLjQKJcOkw7zDtsO8CjIgMCBvYmoKPDwKL0xlbmd0aCAzIDAgUgo+PgpzdHJlYW0KQNC4xOTk5Cg==', 'base64');
      const testImageContent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
      
      fs.writeFileSync(testPdfPath, testPdfContent);
      fs.writeFileSync(testImagePath, testImageContent);

      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/upload-deliverables`)
        .set('Authorization', authToken)
        .attach('files', testPdfPath)
        .attach('files', testImagePath)
        .expect(200);

      expect(response.body.files).toHaveLength(2);
      
      const pdfFile = response.body.files.find((f: any) => f.filename === 'test-document.pdf');
      const imageFile = response.body.files.find((f: any) => f.filename === 'test-screenshot.png');
      
      expect(pdfFile).toMatchObject({
        filename: 'test-document.pdf',
        mimeType: 'application/pdf',
      });
      
      expect(imageFile).toMatchObject({
        filename: 'test-screenshot.png',
        mimeType: 'image/png',
      });

      // Clean up test files
      fs.unlinkSync(testPdfPath);
      fs.unlinkSync(testImagePath);
    });

    it('should reject request without files', async () => {
      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/upload-deliverables`)
        .set('Authorization', authToken)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'No files provided',
      });
    });
  });

  describe('POST /api/milestones/:id/submit-with-files', () => {
    it('should submit milestone with file uploads', async () => {
      // Create test file
      const testFilePath = path.join(__dirname, 'final-deliverable.zip');
      const testFileContent = Buffer.from('UEsDBAoAAAAAAGxvbVAAAAAAAAAAAAAAAAAJAAAAdGVzdC50eHRQSwECFAAKAAAAAABsb21QAAAAAAAAAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAB0ZXN0LnR4dFBLBQYAAAAAAQABADcAAAAfAAAAAAA=', 'base64');
      fs.writeFileSync(testFilePath, testFileContent);

      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/submit-with-files`)
        .set('Authorization', authToken)
        .field('notes', 'Milestone completed with deliverables')
        .attach('files', testFilePath)
        .expect(200);

      expect(response.body).toMatchObject({
        id: milestoneId,
        status: 'submitted',
        uploadedFiles: 1,
        totalFiles: 1,
      });

      expect(response.body.deliverableFiles).toHaveLength(1);
      expect(response.body.deliverableFiles[0]).toMatchObject({
        filename: 'final-deliverable.zip',
        mimeType: 'application/zip',
      });

      // Clean up test file
      fs.unlinkSync(testFilePath);
    });

    it('should submit milestone with existing and new files', async () => {
      // Create test file
      const testFilePath = path.join(__dirname, 'additional-file.txt');
      const testFileContent = 'Additional deliverable content';
      fs.writeFileSync(testFilePath, testFileContent);

      const existingDeliverables = JSON.stringify([
        {
          filename: 'existing-file.pdf',
          url: 'https://example.com/existing-file.pdf',
          size: 12345,
          mimeType: 'application/pdf',
        },
      ]);

      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/submit-with-files`)
        .set('Authorization', authToken)
        .field('notes', 'Final submission with all files')
        .field('existingDeliverables', existingDeliverables)
        .attach('files', testFilePath)
        .expect(200);

      expect(response.body).toMatchObject({
        id: milestoneId,
        status: 'submitted',
        uploadedFiles: 1,
        totalFiles: 2,
      });

      expect(response.body.deliverableFiles).toHaveLength(2);

      // Clean up test file
      fs.unlinkSync(testFilePath);
    });
  });

  describe('POST /api/milestones/:id/submit', () => {
    it('should submit milestone with pre-uploaded deliverables', async () => {
      const deliverables = [
        {
          filename: 'project-source.zip',
          url: 'https://example.supabase.co/storage/v1/object/public/milestone-deliverables/user123/milestone-456/project-source.zip',
          size: 2048576,
          mimeType: 'application/zip',
        },
        {
          filename: 'documentation.pdf',
          url: 'https://example.supabase.co/storage/v1/object/public/milestone-deliverables/user123/milestone-456/documentation.pdf',
          size: 1024000,
          mimeType: 'application/pdf',
        },
      ];

      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/submit`)
        .set('Authorization', authToken)
        .send({
          deliverables,
          notes: 'Milestone completed as per requirements',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: milestoneId,
        status: 'submitted',
      });

      expect(response.body.deliverableFiles).toHaveLength(2);
      expect(response.body.deliverableFiles).toEqual(deliverables);
    });

    it('should submit milestone without deliverables', async () => {
      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/submit`)
        .set('Authorization', authToken)
        .send({
          notes: 'Simple milestone completion',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: milestoneId,
        status: 'submitted',
      });

      expect(response.body.deliverableFiles).toEqual([]);
    });
  });
});