// @ts-nocheck
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSendMail = jest.fn<any>();
const mockVerify = jest.fn<any>();
const mockCreateTransport = jest.fn<any>();

const mockReadFile = jest.fn<any>();

jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

jest.unstable_mockModule('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
  },
  readFile: mockReadFile,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const SMTP_ENV = {
  SMTP_HOST: 'smtp.test.com',
  SMTP_PORT: '587',
  SMTP_USER: 'testuser',
  SMTP_PASSWORD: 'testpass',
  EMAIL_FROM: 'test@freelancexchain.com',
};

function setupMocks() {
  mockSendMail.mockReset();
  mockVerify.mockReset();
  mockCreateTransport.mockReset();
  mockReadFile.mockReset();

  mockCreateTransport.mockReturnValue({
    sendMail: mockSendMail,
    verify: mockVerify,
  });
}

describe('Email Delivery Service', () => {
  let emailService: typeof import('../../services/email-delivery-service.js');

  beforeEach(() => {
    jest.resetModules();
    setupMocks();

    Object.entries(SMTP_ENV).forEach(([key, value]) => {
      process.env[key] = value;
    });
  });

  afterEach(() => {
    Object.keys(SMTP_ENV).forEach((key) => {
      delete process.env[key];
    });
  });

  async function importService() {
    emailService = await import('../../services/email-delivery-service.js');
    return emailService;
  }

  describe('getTransporter', () => {
    it('should create transporter when SMTP config is present', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'testuser',
          pass: 'testpass',
        },
      });
    });

    it('should create transporter with secure=true when port is 465', async () => {
      process.env.SMTP_PORT = '465';
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-2' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true, port: 465 })
      );
    });

    it('should reuse existing transporter on subsequent calls', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-3' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test1',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test2',
        template: 'milestone_approved',
        data: { name: 'test' },
      });

      expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    });

    it('should throw when SMTP_HOST is missing', async () => {
      delete process.env.SMTP_HOST;

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_SEND_FAILED');
        expect(result.error.message).toBe('SMTP configuration not found');
      }
    });

    it('should throw when SMTP_PORT is missing', async () => {
      delete process.env.SMTP_PORT;

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('SMTP configuration not found');
      }
    });

    it('should throw when SMTP_USER is missing', async () => {
      delete process.env.SMTP_USER;

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(result.success).toBe(false);
    });

    it('should throw when SMTP_PASSWORD is missing', async () => {
      delete process.env.SMTP_PASSWORD;

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('renderTemplate', () => {
    it('should replace template variables when template file exists', async () => {
      mockReadFile.mockResolvedValue(
        '<html>Hello {{ name }}, your project {{ project }} is ready.</html>'
      );
      mockSendMail.mockResolvedValue({ messageId: 'msg-10' });

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'Alice', project: 'FreelanceX' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(mockSendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            html: '<html>Hello Alice, your project FreelanceX is ready.</html>',
          })
        );
      }
    });

    it('should fallback to JSON when template file read fails', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockSendMail.mockResolvedValue({ messageId: 'msg-11' });

      await importService();
      const data = { name: 'Bob', project: 'TestProject' };
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(mockSendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            html: `<html><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`,
          })
        );
      }
    });

    it('should handle multiple occurrences of the same variable', async () => {
      mockReadFile.mockResolvedValue(
        '<html>{{ name }} - {{ name }} welcome!</html>'
      );
      mockSendMail.mockResolvedValue({ messageId: 'msg-12' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'Charlie' },
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<html>Charlie - Charlie welcome!</html>',
        })
      );
    });

    it('should handle numeric data values by converting to string', async () => {
      mockReadFile.mockResolvedValue('<html>Rating: {{ rating }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-13' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'review_received',
        data: { rating: 5 },
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<html>Rating: 5</html>',
        })
      );
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-success' });

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test Subject',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messageId).toBe('msg-success');
      }
    });

    it('should use EMAIL_FROM env var when set', async () => {
      process.env.EMAIL_FROM = 'custom@freelancexchain.com';
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-from' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: {},
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'custom@freelancexchain.com' })
      );
    });

    it('should use default EMAIL_FROM when env var not set', async () => {
      delete process.env.EMAIL_FROM;
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-default' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: {},
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'noreply@freelancexchain.com' })
      );
    });

    it('should return error when SMTP config is missing', async () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASSWORD;

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_SEND_FAILED');
      }
    });

    it('should return error when sendMail fails', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSendMail.mockRejectedValue(new Error('Connection refused'));

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_SEND_FAILED');
        expect(result.error.message).toBe('Connection refused');
      }
    });

    it('should handle non-Error thrown values in sendMail failure', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSendMail.mockRejectedValue('string error');

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Failed to send email');
      }
    });
  });

  describe('sendProposalAcceptedEmail', () => {
    it('should send proposal accepted email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ freelancerName }} {{ projectTitle }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-proposal' });

      await importService();
      const result = await emailService.sendProposalAcceptedEmail('freelancer@test.com', {
        freelancerName: 'John',
        projectTitle: 'Build App',
        projectUrl: 'https://example.com/project',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'freelancer@test.com',
          subject: 'Your proposal has been accepted!',
          html: '<html>John Build App</html>',
        })
      );
    });
  });

  describe('sendMilestoneApprovedEmail', () => {
    it('should send milestone approved email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ freelancerName }} {{ milestoneTitle }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-milestone' });

      await importService();
      const result = await emailService.sendMilestoneApprovedEmail('freelancer@test.com', {
        freelancerName: 'Jane',
        milestoneTitle: 'Phase 1',
        amount: '500',
        contractUrl: 'https://example.com/contract',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'freelancer@test.com',
          subject: 'Milestone approved - Payment released',
        })
      );
    });
  });

  describe('sendPaymentReleasedEmail', () => {
    it('should send payment released email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ recipientName }} {{ amount }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-payment' });

      await importService();
      const result = await emailService.sendPaymentReleasedEmail('recipient@test.com', {
        recipientName: 'Bob',
        amount: '1000',
        contractTitle: 'Contract A',
        transactionHash: '0xabc123',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'recipient@test.com',
          subject: 'Payment released',
        })
      );
    });
  });

  describe('sendDisputeCreatedEmail', () => {
    it('should send dispute created email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ arbiterName }} {{ disputeReason }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-dispute' });

      await importService();
      const result = await emailService.sendDisputeCreatedEmail('arbiter@test.com', {
        arbiterName: 'Arbiter1',
        contractTitle: 'Contract B',
        disputeReason: 'Incomplete work',
        disputeUrl: 'https://example.com/dispute',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'arbiter@test.com',
          subject: 'New dispute requires your attention',
        })
      );
    });
  });

  describe('sendContractCreatedEmail', () => {
    it('should send contract created email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ recipientName }} {{ projectTitle }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-contract' });

      await importService();
      const result = await emailService.sendContractCreatedEmail('user@test.com', {
        recipientName: 'Dave',
        projectTitle: 'Project X',
        contractUrl: 'https://example.com/contract',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'New contract created',
        })
      );
    });
  });

  describe('sendMessageReceivedEmail', () => {
    it('should send message received email with sender name in subject', async () => {
      mockReadFile.mockResolvedValue('<html>{{ recipientName }} {{ senderName }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-message' });

      await importService();
      const result = await emailService.sendMessageReceivedEmail('user@test.com', {
        recipientName: 'Eve',
        senderName: 'Frank',
        messagePreview: 'Hello!',
        conversationUrl: 'https://example.com/chat',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'New message from Frank',
        })
      );
    });
  });

  describe('sendReviewReceivedEmail', () => {
    it('should send review received email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ recipientName }} {{ rating }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-review' });

      await importService();
      const result = await emailService.sendReviewReceivedEmail('user@test.com', {
        recipientName: 'Grace',
        reviewerName: 'Heidi',
        rating: 5,
        projectTitle: 'Project Y',
        reviewUrl: 'https://example.com/review',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'You received a new review',
        })
      );
    });
  });

  describe('sendKycApprovedEmail', () => {
    it('should send KYC approved email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ userName }} {{ tier }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-kyc-approve' });

      await importService();
      const result = await emailService.sendKycApprovedEmail('user@test.com', {
        userName: 'Ivan',
        tier: 'Gold',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'KYC verification approved',
        })
      );
    });
  });

  describe('sendKycRejectedEmail', () => {
    it('should send KYC rejected email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ userName }} {{ reason }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-kyc-reject' });

      await importService();
      const result = await emailService.sendKycRejectedEmail('user@test.com', {
        userName: 'Judy',
        reason: 'Invalid ID document',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'KYC verification requires attention',
        })
      );
    });
  });

  describe('sendWeeklyDigestEmail', () => {
    it('should send weekly digest email with correct parameters', async () => {
      mockReadFile.mockResolvedValue('<html>{{ userName }} {{ newProjects }}</html>');
      mockSendMail.mockResolvedValue({ messageId: 'msg-digest' });

      await importService();
      const result = await emailService.sendWeeklyDigestEmail('user@test.com', {
        userName: 'Mallory',
        newProjects: 3,
        newMessages: 5,
        pendingMilestones: 2,
        weeklyEarnings: '500 USDC',
        topProjects: [
          { title: 'Project A', budget: '1000', url: 'https://example.com/a' },
        ],
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Your weekly FreelanceXchain digest',
        })
      );
    });
  });

  describe('testEmailConfiguration', () => {
    it('should return success when verification passes', async () => {
      mockVerify.mockResolvedValue(true);

      await importService();
      const result = await emailService.testEmailConfiguration();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.verified).toBe(true);
      }
    });

    it('should return failure when SMTP config is missing', async () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASSWORD;

      await importService();
      const result = await emailService.testEmailConfiguration();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_CONFIG_INVALID');
        expect(result.error.message).toBe('SMTP configuration not found');
      }
    });

    it('should return failure when verify throws an Error', async () => {
      mockVerify.mockRejectedValue(new Error('Connection timed out'));

      await importService();
      const result = await emailService.testEmailConfiguration();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_CONFIG_INVALID');
        expect(result.error.message).toBe('Connection timed out');
      }
    });

    it('should return failure with generic message when verify throws non-Error', async () => {
      mockVerify.mockRejectedValue('unknown failure');

      await importService();
      const result = await emailService.testEmailConfiguration();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_CONFIG_INVALID');
        expect(result.error.message).toBe('Email configuration is invalid');
      }
    });
  });
});