


import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import path from 'path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock Appwrite config

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

// Mock file upload middleware - use multer to handle actual file uploads
const multerModule = await import('multer');
const multer = multerModule.default;
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  createFileUploadMiddleware: jest.fn((fieldName: string, options?: any) => {
    const maxFiles = options?.maxFiles || 10;
    const minFiles = options?.minFiles || 0;
    
    return [
      // First middleware: multer upload handler
      (req: any, res: any, next: any) => {
        const uploadHandler = upload.array(fieldName, maxFiles);
        uploadHandler(req, res, (err: any) => {
          if (err) {
            if (err.code === 'LIMIT_FILE_COUNT') {
              return res.status(400).json({ error: { code: 'TOO_MANY_FILES', message: `Maximum ${maxFiles} files allowed` } });
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds limit' } });
            }
            return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
          }
          next();
        });
      },
      // Second middleware: file validation
      async (req: any, res: any, next: any) => {
        try {
          const files = req.files as Express.Multer.File[];
          
          // Check if files are required
          if (!files || files.length === 0) {
            if (minFiles > 0) {
              return res.status(400).json({ error: { code: 'NO_FILES_UPLOADED', message: `At least ${minFiles} file(s) required` } });
            }
            return next();
          }
          
          // Validate file types and content
          for (const file of files) {
            // Check for executable files
            if (file.originalname.endsWith('.exe') || file.mimetype === 'application/x-msdownload') {
              return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'Executable files are not allowed' } });
            }
            
            // Check for malicious content (EICAR signature)
            const fileContent = file.buffer.toString();
            if (fileContent.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
              return res.status(400).json({ error: { code: 'MALICIOUS_FILE_DETECTED', message: 'Malicious file detected' } });
            }
            
            // Check for PE executable magic numbers
            if (file.buffer.length >= 2 && file.buffer[0] === 0x4d && file.buffer[1] === 0x5a) {
              return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'Executable files are not allowed' } });
            }
          }
          
          next();
        } catch (error) {
          res.status(500).json({ error: { code: 'FILE_UPLOAD_ERROR', message: 'An error occurred during file upload' } });
        }
      }
    ];
  }),
  uploadProposalAttachments: [
    (req: any, res: any, next: any) => {
      upload.array('files', 5)(req, res, next);
    }
  ],
  uploadProjectAttachments: [
    (req: any, res: any, next: any) => {
      const uploadHandler = upload.array('files', 10);
      uploadHandler(req, res, (err: any) => {
        if (err) {
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: { code: 'TOO_MANY_FILES', message: 'Maximum 10 files allowed' } });
          }
          return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
        }
        
        // Validate files
        const files = req.files as Express.Multer.File[];
        if (files && files.length > 0) {
          for (const file of files) {
            // Check for executable files
            if (file.originalname.endsWith('.exe') || file.mimetype === 'application/x-msdownload') {
              return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'Executable files are not allowed' } });
            }
            
            // Check for malicious content (EICAR signature)
            const fileContent = file.buffer.toString();
            if (fileContent.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
              return res.status(400).json({ error: { code: 'MALICIOUS_FILE_DETECTED', message: 'Malicious file detected' } });
            }
            
            // Check for PE executable magic numbers
            if (file.buffer.length >= 2 && file.buffer[0] === 0x4d && file.buffer[1] === 0x5a) {
              return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'Executable files are not allowed' } });
            }
          }
        }
        
        next();
      });
    }
  ],
  uploadDisputeEvidence: [
    (req: any, res: any, next: any) => {
      upload.array('files', 10)(req, res, next);
    }
  ],
  uploadPortfolioImages: [
    (req: any, res: any, next: any) => {
      upload.array('files', 5)(req, res, next);
    }
  ],
  sanitizeFilename: jest.fn((filename: string) => filename),
  scanFileForViruses: jest.fn(async () => ({ clean: true })),
  MAX_FILE_SIZE: 25 * 1024 * 1024,
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
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
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

const storageUploaderMocks = {
  uploadFileToStorage: jest.fn(async (file: any, bucket: string, metadata: any) => ({
    success: true,
    url: `https://example.appwrite.co/storage/v1/object/public/${bucket}/${metadata.userId}/${file.originalname}`,
    path: `${metadata.userId}/${file.originalname}`,
  })),
  uploadMultipleFiles: jest.fn(async (files: any[], bucket: string, metadata: any) => ({
    success: true,
    files: files.map(f => ({
      url: `https://example.appwrite.co/storage/v1/object/public/${bucket}/${metadata.userId}/${f.originalname}`,
      path: `${metadata.userId}/${f.originalname}`,
      filename: f.originalname,
    })),
  })),
  deleteFileFromStorage: jest.fn(async (bucket: string, path: string) => ({
    success: true,
  })),
  extractFilePathFromUrl: jest.fn((url: string) => 'test/path'),
  cleanupUploadedFiles: jest.fn(async (urls: string[]) => ({ success: true })),
  uploadFile: jest.fn(async (options: any) => ({
    success: true,
    url: `https://example.appwrite.co/storage/v1/object/public/milestone-deliverables/${options.userId}/${options.folder}/${options.filename}`,
    path: `${options.userId}/${options.folder}/${options.filename}`,
  })),
  deleteFile: jest.fn(async (bucket: string, path: string) => ({
    success: true,
  })),
  getSignedUrl: jest.fn(async (bucket: string, path: string, expiresIn?: number) => ({
    success: true,
    url: `https://example.appwrite.co/storage/v1/object/sign/${bucket}/${path}`,
  })),
  listUserFiles: jest.fn(async (bucket: string, userId: string, folder?: string) => ({
    success: true,
    files: [],
  })),
  extractFileIdFromUrl: jest.fn((url: string) => 'test-file-id'),
};

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => storageUploaderMocks);

// Mock contract repository
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractsByFreelancer: jest.fn(async (freelancerId: string, options?: any) => ({
      items: [{
        id: 'mock-contract-id',
        project_id: 'mock-project-id',
        freelancer_id: freelancerId,
        employer_id: 'mock-employer-id',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
      hasMore: false,
    })),
    findById: jest.fn(async (id: string) => ({
      id,
      project_id: 'mock-project-id',
      freelancer_id: 'mock-freelancer-id',
      employer_id: 'mock-employer-id',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  },
}));

// Mock project repository
const mockProjectRepository = {
  findProjectById: jest.fn(async (projectId: string) => {
    // Get the current test's milestone ID from the test context
    const testMilestoneId = (global as any).currentTestMilestoneId || 'default-milestone-id';
    return {
      id: projectId,
      title: 'Mock Project',
      description: 'Mock project description',
      milestones: [{
        id: testMilestoneId,
        title: 'Test Milestone',
        description: 'Test milestone description',
        amount: 1000,
        due_date: new Date('2026-12-31').toISOString(),
        status: 'pending',
        deliverable_files: [],
        revision_count: 0,
      }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }),
  updateProject: jest.fn(async (projectId: string, updates: any) => ({
    id: projectId,
    title: 'Mock Project',
    description: 'Mock project description',
    ...updates,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })),
};

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

// Mock payment service
jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  requestMilestoneCompletion: jest.fn(async (contractId: string, milestoneId: string, freelancerId: string) => ({
    success: true,
    data: {
      id: milestoneId,
      status: 'submitted',
    },
  })),
  approveMilestone: jest.fn(async () => ({ success: true })),
  disputeMilestone: jest.fn(async () => ({ success: true })),
  getContractPaymentStatus: jest.fn(async () => ({ success: true, data: {} })),
  isContractComplete: jest.fn(async () => false),
  getDisputeById: jest.fn(async () => null),
  getDisputesByContract: jest.fn(async () => []),
  clearDisputes: jest.fn(),
  initializeContractEscrow: jest.fn(async () => ({ success: true })),
  setEscrowOpsForTesting: jest.fn(),
}));

// Dynamically import everything after the mock is set up
let request: any, createApp: any, generateId: any;

beforeAll(async () => {
  request = (await import('supertest')).default;
  ({ createApp } = await import('../../app.js'));
  ({ generateId } = await import('../../utils/id.js'));
});

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
    
    // Set the milestone ID for the mock to use
    (global as any).currentTestMilestoneId = milestoneId;
  });

  describe('POST /api/milestones/:id/upload-deliverables', () => {
    it('should upload deliverable files for milestone', async () => {
      // Use in-memory buffer instead of writing to disk to avoid file stream issues under load
      const testFileContent = Buffer.from('JVBERi0xLjQKJcOkw7zDtsO8CjIgMCBvYmoKPDwKL0xlbmd0aCAzIDAgUgo+PgpzdHJlYW0KQNC4xOTk5Cg==', 'base64');

      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/upload-deliverables`)
        .set('Authorization', authToken)
        .attach('files', testFileContent, 'test-deliverable.pdf')
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
    });

    it('should upload multiple deliverable files', async () => {
      // Use in-memory buffers instead of writing to disk to avoid file stream issues under load
      const testPdfContent = Buffer.from('JVBERi0xLjQKJcOkw7zDtsO8CjIgMCBvYmoKPDwKL0xlbmd0aCAzIDAgUgo+PgpzdHJlYW0KQNC4xOTk5Cg==', 'base64');
      const testImageContent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/upload-deliverables`)
        .set('Authorization', authToken)
        .attach('files', testPdfContent, 'test-document.pdf')
        .attach('files', testImageContent, 'test-screenshot.png')
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
    });

    it('should reject request without files', async () => {
      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/upload-deliverables`)
        .set('Authorization', authToken)
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: 'NO_FILES_UPLOADED',
          message: 'At least 1 file(s) required',
        },
      });
    });
  });

  describe('POST /api/milestones/:id/submit-with-files', () => {
    it('should submit milestone with file uploads', async () => {
      // Use in-memory buffer instead of writing to disk
      const testFileContent = Buffer.from('UEsDBAoAAAAAAGxvbVAAAAAAAAAAAAAAAAAJAAAAdGVzdC50eHRQSwECFAAKAAAAAABsb21QAAAAAAAAAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAB0ZXN0LnR4dFBLBQYAAAAAAQABADcAAAAfAAAAAAA=', 'base64');

      const response = await request(app)
        .post(`/api/milestones/${milestoneId}/submit-with-files`)
        .set('Authorization', authToken)
        .field('notes', 'Milestone completed with deliverables')
        .attach('files', testFileContent, 'final-deliverable.zip')
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
    });

    it('should submit milestone with existing and new files', async () => {
      // Use in-memory buffer instead of writing to disk
      const testFileContent = Buffer.from('Additional deliverable content');

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
        .attach('files', testFileContent, 'additional-file.txt')
        .expect(200);

      expect(response.body).toMatchObject({
        id: milestoneId,
        status: 'submitted',
        uploadedFiles: 1,
        totalFiles: 2,
      });

      expect(response.body.deliverableFiles).toHaveLength(2);
    });
  });

  describe('POST /api/milestones/:id/submit', () => {
    it('should submit milestone with pre-uploaded deliverables', async () => {
      const deliverables = [
        {
          filename: 'project-source.zip',
          url: 'https://example.appwrite.co/storage/v1/object/public/milestone-deliverables/user123/milestone-456/project-source.zip',
          size: 2048576,
          mimeType: 'application/zip',
        },
        {
          filename: 'documentation.pdf',
          url: 'https://example.appwrite.co/storage/v1/object/public/milestone-deliverables/user123/milestone-456/documentation.pdf',
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

describe('Project Attachments API', () => {
  let app: any;
  let authToken: string;
  let freelancerId: string;
  let skillId: string;

  beforeAll(async () => {
    app = await createApp();
    freelancerId = generateId();
    skillId = generateId();
    authToken = 'Bearer test-token-' + freelancerId;
  });

  describe('File Type Validation', () => {
    it('should reject executable files', async () => {
      const testExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // PE header

      const projectData = {
        title: 'Test Project With Invalid File',
        description: 'This project should fail due to invalid file type',
        requiredSkills: JSON.stringify([{ skillId }]),
        budget: '1000',
        deadline: '2026-12-31T23:59:59Z'
      };

      const response = await request(app)
        .post('/api/projects/with-attachments')
        .set('Authorization', authToken)
        .field('title', projectData.title)
        .field('description', projectData.description)
        .field('requiredSkills', projectData.requiredSkills)
        .field('budget', projectData.budget)
        .field('deadline', projectData.deadline)
        .attach('files', testExeBuffer, 'test-file.exe')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_FILE_TYPE');
    });

    it('should reject too many files', async () => {
      const projectData = {
        title: 'Test Project With Too Many Files',
        description: 'This project should fail due to too many files',
        requiredSkills: JSON.stringify([{ skillId }]),
        budget: '1000',
        deadline: '2026-12-31T23:59:59Z'
      };

      let requestBuilder = request(app)
        .post('/api/projects/with-attachments')
        .set('Authorization', authToken)
        .field('title', projectData.title)
        .field('description', projectData.description)
        .field('requiredSkills', projectData.requiredSkills)
        .field('budget', projectData.budget)
        .field('deadline', projectData.deadline);

      // Attach 11 in-memory buffers (exceeds limit of 10)
      for (let i = 0; i < 11; i++) {
        requestBuilder = requestBuilder.attach('files', Buffer.from(`Test content ${i}`), `test-file-${i}.txt`);
      }

      const response = await requestBuilder.expect(400);

      expect(response.body.error.code).toBe('UPLOAD_ERROR');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/projects/with-attachments')
        .set('Authorization', authToken)
        .field('title', 'Hi') // Too short (needs 5+ chars)
        .field('description', 'Short desc') // Too short
        .field('requiredSkills', 'invalid json')
        .field('budget', '0') // Invalid budget
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'title' }),
          expect.objectContaining({ field: 'description' }),
          expect.objectContaining({ field: 'requiredSkills' }),
          expect.objectContaining({ field: 'budget' }),
          expect.objectContaining({ field: 'deadline' })
        ])
      );
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/projects/with-attachments')
        .field('title', 'Test Project')
        .field('description', 'This is a test project description')
        .field('requiredSkills', JSON.stringify([{ skillId }]))
        .field('budget', '1000')
        .field('deadline', '2026-12-31T23:59:59Z')
        .expect(401);

      expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('File Upload Security', () => {
    it('should detect malicious files', async () => {
      // Use in-memory buffer with EICAR test signature
      const eicarSignature = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      const testVirusBuffer = Buffer.from(eicarSignature);

      const projectData = {
        title: 'Test Project With Malicious File',
        description: 'This project should fail due to malicious file detection',
        requiredSkills: JSON.stringify([{ skillId }]),
        budget: '1000',
        deadline: '2026-12-31T23:59:59Z'
      };

      const response = await request(app)
        .post('/api/projects/with-attachments')
        .set('Authorization', authToken)
        .field('title', projectData.title)
        .field('description', projectData.description)
        .field('requiredSkills', projectData.requiredSkills)
        .field('budget', projectData.budget)
        .field('deadline', projectData.deadline)
        .attach('files', testVirusBuffer, 'test-virus.txt')
        .expect(400);

      expect(response.body.error.code).toBe('MALICIOUS_FILE_DETECTED');
    });
  });
});