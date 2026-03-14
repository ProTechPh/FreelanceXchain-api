import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

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
}));

// Mock rate limiter middleware
jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (req: any, res: any, next: any) => next(),
  fileUploadRateLimiter: (req: any, res: any, next: any) => next(),
}));

// Mock file upload middleware
jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  createFileUploadMiddleware: jest.fn(() => [
    (req: any, res: any, next: any) => {
      // Mock file upload - simulate files being attached
      if (req.method === 'POST' && req.url?.includes('upload')) {
        req.files = [
          {
            originalname: 'test-file.pdf',
            mimetype: 'application/pdf',
            size: 1024,
            buffer: Buffer.from('test content'),
          },
        ];
      }
      next();
    },
  ]),
}));

// Mock validation middleware
jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: () => (req: any, res: any, next: any) => next(),
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
}));

// Mock file upload utility
jest.unstable_mockModule(resolveModule('src/utils/file-upload.ts'), () => ({
  uploadFile: jest.fn(async (options: any) => ({
    success: true,
    url: `https://example.supabase.co/storage/v1/object/public/milestone-deliverables/${options.userId}/${options.folder}/${options.filename}`,
    path: `${options.userId}/${options.folder}/${options.filename}`,
  })),
}));

// Dynamically import everything after the mock is set up
let request: any, createApp: any, generateId: any, fs: any;

beforeAll(async () => {
  request = (await import('supertest')).default;
  const appModule = await import('../../app.js');
  console.log('App module:', appModule);
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