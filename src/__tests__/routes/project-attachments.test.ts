


import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock the auth-middleware to bypass authentication
// This must be done BEFORE any module that imports auth-middleware is loaded
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer test-token-')) {
      req.user = { id: authHeader.slice(18), userId: authHeader.slice(18), email: 'test@example.com', role: 'employer' };
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
  requireVerifiedKyc: (req: any, res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  createProject: jest.fn(async (employerId: string, input: any) => ({
    success: true,
    data: {
      id: 'mock-project-id',
      employerId,
      employer_id: employerId,
      title: input.title,
      description: input.description,
      budget: input.budget,
      deadline: input.deadline,
      status: 'open',
      requiredSkills: input.requiredSkills,
      required_skills: [],
      milestones: [],
      tags: input.tags ?? [],
      attachments: input.attachments ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })),
  getProjectById: jest.fn(),
  updateProject: jest.fn(),
  setMilestones: jest.fn(),
  listOpenProjects: jest.fn(),
  searchProjects: jest.fn(),
  listProjectsBySkills: jest.fn(),
  listProjectsByBudgetRange: jest.fn(),
  listProjectsByEmployer: jest.fn(),
  listProjectsByCategory: jest.fn(),
  listProjectsByMultipleCategories: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  // Types (for TypeScript compatibility)
  FileMetadata: {} as any,
  UploadResult: {} as any,
  // Functions
  uploadFileToStorage: jest.fn(async (buffer: any, filename: string, mimeType: string) => ({
    success: true,
    metadata: {
      url: `https://example.supabase.co/storage/v1/object/public/project-attachments/${filename}`,
      filename,
      size: buffer.length,
      mimeType,
    },
  })),
  uploadMultipleFiles: jest.fn(async (files: any[]) =>
    files.map((f: any) => ({
      success: true,
      metadata: {
        url: `https://example.supabase.co/storage/v1/object/public/project-attachments/${f.originalname}`,
        filename: f.originalname,
        size: f.size,
        mimeType: f.detectedMimeType || f.mimetype,
      },
    }))
  ),
  deleteFileFromStorage: jest.fn(async () => ({ success: true })),
  extractFilePathFromUrl: jest.fn((url: string) => url.split('/').pop() || null),
  cleanupUploadedFiles: jest.fn(async () => {}),
}));

// Dynamically import everything after the mock is set up
let request: any, createApp: any, generateId: any, fs: any;

beforeAll(async () => {
  request = (await import('supertest')).default;
  ({ createApp } = await import('../../app.js'));
  ({ generateId } = await import('../../utils/id.js'));
  fs = await import('fs');
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Project Attachments API', () => {
  let app: any;
  let authToken: string;
  let employerId: string;
  let skillId: string;

  beforeAll(async () => {
    app = await createApp();
    employerId = generateId();
    skillId = generateId();
    authToken = 'Bearer test-token-' + employerId;
  });

  describe('POST /api/projects/with-attachments', () => {
    it('should create project without attachments', async () => {
      const projectData = {
        title: 'Test Project Without Files',
        description: 'This is a test project description that is long enough to meet requirements',
        requiredSkills: JSON.stringify([{ skillId }]),
        budget: '1000',
        deadline: '2026-12-31T23:59:59Z',
        tags: JSON.stringify(['test', 'project'])
      };

      const response = await request(app)
        .post('/api/projects/with-attachments')
        .set('Authorization', authToken)
        .field('title', projectData.title)
        .field('description', projectData.description)
        .field('requiredSkills', projectData.requiredSkills)
        .field('budget', projectData.budget)
        .field('deadline', projectData.deadline)
        .field('tags', projectData.tags)
        .expect(201);

      expect(response.body).toMatchObject({
        title: projectData.title,
        description: projectData.description,
        budget: 1000,
        status: 'open',
        attachments: [],
        tags: ['test', 'project']
      });

      expect(response.body.id).toBeDefined();
      expect(response.body.employerId).toBe(employerId);
    });

    it('should create project with image attachments', async () => {
      // Create test image file
      const testImagePath = path.join(__dirname, 'test-image.png');
      const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(testImagePath, testImageBuffer);

      const projectData = {
        title: 'Test Project With Image',
        description: 'This is a test project with image attachments for reference materials',
        requiredSkills: JSON.stringify([{ skillId }]),
        budget: '2000',
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
        .attach('files', testImagePath)
        .expect(201);

      expect(response.body).toMatchObject({
        title: projectData.title,
        description: projectData.description,
        budget: 2000,
        status: 'open'
      });

      expect(response.body.attachments).toHaveLength(1);
      expect(response.body.attachments[0]).toMatchObject({
        filename: 'test-image.png',
        mimeType: 'image/png'
      });
      expect(response.body.attachments[0].url).toContain('project-attachments');
      expect(response.body.attachments[0].size).toBeGreaterThan(0);

      // Clean up test file
      fs.unlinkSync(testImagePath);
    });

    it('should create project with multiple attachments', async () => {
      // Create test files
      const testImagePath = path.join(__dirname, 'test-image.jpg');
      const testDocPath = path.join(__dirname, 'test-doc.txt');
      
      const testImageBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A', 'base64');
      const testDocContent = 'This is a test document for project requirements.';
      
      fs.writeFileSync(testImagePath, testImageBuffer);
      fs.writeFileSync(testDocPath, testDocContent);

      const projectData = {
        title: 'Test Project With Multiple Files',
        description: 'This is a test project with multiple file attachments including images and documents',
        requiredSkills: JSON.stringify([{ skillId }]),
        budget: '3000',
        deadline: '2026-12-31T23:59:59Z',
        tags: JSON.stringify(['multi-file', 'test'])
      };

      const response = await request(app)
        .post('/api/projects/with-attachments')
        .set('Authorization', authToken)
        .field('title', projectData.title)
        .field('description', projectData.description)
        .field('requiredSkills', projectData.requiredSkills)
        .field('budget', projectData.budget)
        .field('deadline', projectData.deadline)
        .field('tags', projectData.tags)
        .attach('files', testImagePath)
        .attach('files', testDocPath)
        .expect(201);

      expect(response.body.attachments).toHaveLength(2);
      
      const imageAttachment = response.body.attachments.find((a: any) => a.filename === 'test-image.jpg');
      const docAttachment = response.body.attachments.find((a: any) => a.filename === 'test-doc.txt');
      
      expect(imageAttachment).toMatchObject({
        filename: 'test-image.jpg',
        mimeType: 'image/jpeg'
      });
      
      expect(docAttachment).toMatchObject({
        filename: 'test-doc.txt',
        mimeType: 'text/plain'
      });

      // Clean up test files
      fs.unlinkSync(testImagePath);
      fs.unlinkSync(testDocPath);
    });

    it('should reject invalid file types', async () => {
      // Create test executable file
      const testExePath = path.join(__dirname, 'test-file.exe');
      const testExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // PE header
      fs.writeFileSync(testExePath, testExeBuffer);

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
        .attach('files', testExePath)
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_FILE_TYPE');

      // Clean up test file
      fs.unlinkSync(testExePath);
    });

    it('should reject too many files', async () => {
      const projectData = {
        title: 'Test Project With Too Many Files',
        description: 'This project should fail due to too many files',
        requiredSkills: JSON.stringify([{ skillId }]),
        budget: '1000',
        deadline: '2026-12-31T23:59:59Z'
      };

      // Create 11 test files (exceeds limit of 10)
      const testFiles: string[] = [];
      for (let i = 0; i < 11; i++) {
        const testFilePath = path.join(__dirname, `test-file-${i}.txt`);
        fs.writeFileSync(testFilePath, `Test content ${i}`);
        testFiles.push(testFilePath);
      }

      let requestBuilder = request(app)
        .post('/api/projects/with-attachments')
        .set('Authorization', authToken)
        .field('title', projectData.title)
        .field('description', projectData.description)
        .field('requiredSkills', projectData.requiredSkills)
        .field('budget', projectData.budget)
        .field('deadline', projectData.deadline);

      // Attach all files
      testFiles.forEach(filePath => {
        requestBuilder = requestBuilder.attach('files', filePath);
      });

      const response = await requestBuilder.expect(400);

      expect(response.body.error.code).toBe('TOO_MANY_FILES');

      // Clean up test files
      testFiles.forEach(filePath => fs.unlinkSync(filePath));
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/projects/with-attachments')
        .set('Authorization', authToken)
        .field('title', 'Short') // Too short
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
          expect.objectContaining({ field: 'budget' })
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
      // Create EICAR test file
      const testVirusPath = path.join(__dirname, 'test-virus.txt');
      const eicarSignature = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      fs.writeFileSync(testVirusPath, eicarSignature);

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
        .attach('files', testVirusPath)
        .expect(400);

      expect(response.body.error.code).toBe('MALICIOUS_FILE_DETECTED');

      // Clean up test file
      fs.unlinkSync(testVirusPath);
    });
  });
});