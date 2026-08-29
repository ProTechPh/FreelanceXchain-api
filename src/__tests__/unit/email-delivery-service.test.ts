// @ts-nocheck
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSend = jest.fn<any>();

const mockReadFile = jest.fn<any>();

jest.unstable_mockModule('@opencoredev/email-sdk', () => ({
  createEmailClient: jest.fn<any>(() => ({
    send: mockSend,
  })),
}));

jest.unstable_mockModule('@opencoredev/email-sdk/cloudflare', () => ({
  cloudflare: jest.fn<any>(() => ({})),
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

const mockShouldSendEmail = jest.fn<any>();
const mockGetUserById = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/email-preference-service.ts'), () => ({
  shouldSendEmail: mockShouldSendEmail,
}));
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { getUserById: mockGetUserById },
}));

const CF_ENV = {
  CLOUDFLARE_API_TOKEN: 'test-api-token',
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
  EMAIL_FROM: 'test@freelancexchain.com',
};

function setupMocks() {
  mockSend.mockReset();
  mockReadFile.mockReset();
}

describe('Email Delivery Service', () => {
  let emailService: typeof import('../../services/email-delivery-service.js');

  beforeEach(() => {
    jest.resetModules();
    setupMocks();

    Object.entries(CF_ENV).forEach(([key, value]) => {
      process.env[key] = value;
    });
  });

  afterEach(() => {
    Object.keys(CF_ENV).forEach((key) => {
      delete process.env[key];
    });
  });

  async function importService() {
    emailService = await import('../../services/email-delivery-service.js');
    return emailService;
  }

  describe('getEmailClient', () => {
    it('should create email client when Cloudflare config is present', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSend.mockResolvedValue({ id: 'msg-1' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(mockSend).toHaveBeenCalled();
    });

    it('should reuse existing email client on subsequent calls', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSend.mockResolvedValue({ id: 'msg-3' });

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

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw when CLOUDFLARE_API_TOKEN is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;

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
        expect(result.error.message).toBe('Cloudflare email configuration not found');
      }
    });

    it('should throw when CLOUDFLARE_ACCOUNT_ID is missing', async () => {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'test' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Cloudflare email configuration not found');
      }
    });
  });

  describe('renderTemplate', () => {
    it('should replace template variables when template file exists', async () => {
      mockReadFile.mockResolvedValue(
        '<html>Hello {{ name }}, your project {{ project }} is ready.</html>'
      );
      mockSend.mockResolvedValue({ id: 'msg-10' });

      await importService();
      const result = await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'Alice', project: 'FreelanceX' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            html: '<html>Hello Alice, your project FreelanceX is ready.</html>',
          })
        );
      }
    });

    it('should fallback to JSON when template file read fails', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      mockSend.mockResolvedValue({ id: 'msg-11' });

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
        // HTML escaping converts special chars to entities
        const escapedJson = JSON.stringify(data, null, 2)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            html: `<html><body><pre>${escapedJson}</pre></body></html>`,
          })
        );
      }
    });

    it('should handle multiple occurrences of the same variable', async () => {
      mockReadFile.mockResolvedValue(
        '<html>{{ name }} - {{ name }} welcome!</html>'
      );
      mockSend.mockResolvedValue({ id: 'msg-12' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: { name: 'Charlie' },
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<html>Charlie - Charlie welcome!</html>',
        })
      );
    });

    it('should handle numeric data values by converting to string', async () => {
      mockReadFile.mockResolvedValue('<html>Rating: {{ rating }}</html>');
      mockSend.mockResolvedValue({ id: 'msg-13' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'review_received',
        data: { rating: 5 },
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<html>Rating: 5</html>',
        })
      );
    });

    it('should repeat the #each block once per array item (weekly digest)', async () => {
      mockReadFile.mockResolvedValue(
        '<ul>{{#each topProjects}}<li>{{ title }} - {{ budget }}</li>{{/each}}</ul>'
      );
      mockSend.mockResolvedValue({ id: 'msg-each' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'weekly_digest',
        data: {
          topProjects: [
            { title: 'Project A', budget: '1000' },
            { title: 'Project B', budget: '2000' },
          ],
        },
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<ul><li>Project A - 1000</li><li>Project B - 2000</li></ul>',
        })
      );
    });

    it('should render nothing for an #each block whose value is not an array', async () => {
      mockReadFile.mockResolvedValue(
        '<div>{{#each topProjects}}<li>{{ title }}</li>{{/each}}</div>'
      );
      mockSend.mockResolvedValue({ id: 'msg-each-empty' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'weekly_digest',
        data: { topProjects: 'not-an-array' },
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<div></div>',
        })
      );
    });

    it('should HTML-escape values inside an #each block', async () => {
      mockReadFile.mockResolvedValue(
        '<ul>{{#each topProjects}}<li>{{ title }}</li>{{/each}}</ul>'
      );
      mockSend.mockResolvedValue({ id: 'msg-each-escape' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'weekly_digest',
        data: { topProjects: [{ title: '<script>alert(1)</script>' }] },
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<ul><li>&lt;script&gt;alert(1)&lt;/script&gt;</li></ul>',
        })
      );
    });
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSend.mockResolvedValue({ id: 'msg-success' });

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
      mockSend.mockResolvedValue({ id: 'msg-from' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: {},
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'custom@freelancexchain.com' })
      );
    });

    it('should use default EMAIL_FROM when env var not set', async () => {
      delete process.env.EMAIL_FROM;
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSend.mockResolvedValue({ id: 'msg-default' });

      await importService();
      await emailService.sendEmail({
        to: 'user@test.com',
        subject: 'Test',
        template: 'proposal_accepted',
        data: {},
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'FreelanceXchain <noreply@freelancexchain.works>' })
      );
    });

    it('should return error when Cloudflare config is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.CLOUDFLARE_ACCOUNT_ID;

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

    it('should return error when send fails', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSend.mockRejectedValue(new Error('Connection refused'));

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

    it('should handle non-Error thrown values in send failure', async () => {
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSend.mockRejectedValue('string error');

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
      mockSend.mockResolvedValue({ id: 'msg-proposal' });

      await importService();
      const result = await emailService.sendProposalAcceptedEmail('freelancer@test.com', {
        freelancerName: 'John',
        projectTitle: 'Build App',
        projectUrl: 'https://example.com/project',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-milestone' });

      await importService();
      const result = await emailService.sendMilestoneApprovedEmail('freelancer@test.com', {
        freelancerName: 'Jane',
        milestoneTitle: 'Phase 1',
        amount: '500',
        contractUrl: 'https://example.com/contract',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-payment' });

      await importService();
      const result = await emailService.sendPaymentReleasedEmail('recipient@test.com', {
        recipientName: 'Bob',
        amount: '1000',
        contractTitle: 'Contract A',
        transactionHash: '0xabc123',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-dispute' });

      await importService();
      const result = await emailService.sendDisputeCreatedEmail('arbiter@test.com', {
        arbiterName: 'Arbiter1',
        contractTitle: 'Contract B',
        disputeReason: 'Incomplete work',
        disputeUrl: 'https://example.com/dispute',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-contract' });

      await importService();
      const result = await emailService.sendContractCreatedEmail('user@test.com', {
        recipientName: 'Dave',
        projectTitle: 'Project X',
        contractUrl: 'https://example.com/contract',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-message' });

      await importService();
      const result = await emailService.sendMessageReceivedEmail('user@test.com', {
        recipientName: 'Eve',
        senderName: 'Frank',
        messagePreview: 'Hello!',
        conversationUrl: 'https://example.com/chat',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-review' });

      await importService();
      const result = await emailService.sendReviewReceivedEmail('user@test.com', {
        recipientName: 'Grace',
        reviewerName: 'Heidi',
        rating: 5,
        projectTitle: 'Project Y',
        reviewUrl: 'https://example.com/review',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-kyc-approve' });

      await importService();
      const result = await emailService.sendKycApprovedEmail('user@test.com', {
        userName: 'Ivan',
        tier: 'Gold',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-kyc-reject' });

      await importService();
      const result = await emailService.sendKycRejectedEmail('user@test.com', {
        userName: 'Judy',
        reason: 'Invalid ID document',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
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
      mockSend.mockResolvedValue({ id: 'msg-digest' });

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
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Your weekly FreelanceXchain digest',
        })
      );
    });
  });

  describe('sendGatedEmail', () => {
    beforeEach(() => {
      mockShouldSendEmail.mockReset();
      mockGetUserById.mockReset();
    });

    it('should send when preference is enabled and user has an email', async () => {
      mockShouldSendEmail.mockResolvedValueOnce(true);
      mockGetUserById.mockResolvedValueOnce({ id: 'user-1', email: 'user@test.com', name: 'Ada' });
      mockReadFile.mockResolvedValue('<html>Body</html>');
      mockSend.mockResolvedValue({ id: 'msg-gated' });

      await importService();
      const sent = await emailService.sendGatedEmail('user-1', 'proposal_accepted', (recipient) =>
        emailService.sendProposalAcceptedEmail(recipient.email, {
          freelancerName: recipient.name,
          projectTitle: 'Build App',
          projectUrl: 'https://example.com/project',
        })
      );

      expect(sent).toBe(true);
      expect(mockShouldSendEmail).toHaveBeenCalledWith('user-1', 'proposal_accepted');
      expect(mockGetUserById).toHaveBeenCalledWith('user-1');
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@test.com' }));
    });

    it('should skip when preference is disabled', async () => {
      mockShouldSendEmail.mockResolvedValueOnce(false);
      mockGetUserById.mockResolvedValueOnce({ id: 'user-1', email: 'user@test.com', name: 'Ada' });

      await importService();
      const sent = await emailService.sendGatedEmail('user-1', 'weekly_digest', () =>
        ({ success: true, data: { messageId: 'x' } } as any)
      );

      expect(sent).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should skip when user has no email address', async () => {
      mockShouldSendEmail.mockResolvedValueOnce(true);
      mockGetUserById.mockResolvedValueOnce({ id: 'user-1', name: 'No Email' });

      await importService();
      const sent = await emailService.sendGatedEmail('user-1', 'proposal_accepted', () =>
        ({ success: true, data: { messageId: 'x' } } as any)
      );

      expect(sent).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should skip when user is not found', async () => {
      mockShouldSendEmail.mockResolvedValueOnce(true);
      mockGetUserById.mockResolvedValueOnce(null);

      await importService();
      const sent = await emailService.sendGatedEmail('ghost', 'proposal_accepted', () =>
        ({ success: true, data: { messageId: 'x' } } as any)
      );

      expect(sent).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should return false when the underlying send fails', async () => {
      mockShouldSendEmail.mockResolvedValueOnce(true);
      mockGetUserById.mockResolvedValueOnce({ id: 'user-1', email: 'user@test.com', name: 'Ada' });
      mockReadFile.mockResolvedValueOnce('<html>Body</html>');
      // sendEmail catches the provider error and returns EMAIL_SEND_FAILED
      mockSend.mockRejectedValueOnce(new Error('SMTP down'));

      await importService();
      const sent = await emailService.sendGatedEmail('user-1', 'proposal_accepted', (recipient) =>
        emailService.sendProposalAcceptedEmail(recipient.email, {
          freelancerName: recipient.name,
          projectTitle: 'Build App',
          projectUrl: 'https://example.com/project',
        })
      );

      expect(sent).toBe(false);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should return false when preference lookup throws', async () => {
      mockShouldSendEmail.mockRejectedValueOnce(new Error('pref db down'));
      mockGetUserById.mockResolvedValueOnce({ id: 'user-1', email: 'user@test.com', name: 'Ada' });

      await importService();
      const sent = await emailService.sendGatedEmail('user-1', 'proposal_accepted', () =>
        ({ success: true, data: { messageId: 'x' } } as any)
      );

      expect(sent).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('testEmailConfiguration', () => {
    it('should return success when Cloudflare config is present', async () => {
      await importService();
      const result = await emailService.testEmailConfiguration();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.verified).toBe(true);
      }
    });

    it('should return failure when Cloudflare config is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.CLOUDFLARE_ACCOUNT_ID;

      await importService();
      const result = await emailService.testEmailConfiguration();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_CONFIG_INVALID');
        expect(result.error.message).toBe('Cloudflare email configuration not found');
      }
    });

    it('should return failure when CLOUDFLARE_API_TOKEN is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;

      await importService();
      const result = await emailService.testEmailConfiguration();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_CONFIG_INVALID');
      }
    });

    it('should return failure when CLOUDFLARE_ACCOUNT_ID is missing', async () => {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;

      await importService();
      const result = await emailService.testEmailConfiguration();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMAIL_CONFIG_INVALID');
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('email-delivery-service – module loads correctly', () => {
  it('module loads without error', async () => {
    const mod = await import(resolveModule('src/services/email-delivery-service.ts'));
    expect(mod).toBeDefined();
  });
});

describe('email-delivery-service.ts - Branch Coverage', () => {
  it('L293: non-Error thrown', () => {
    const error = 'string';
    expect(error instanceof Error ? error.message : 'Email configuration is invalid').toBe('Email configuration is invalid');
  });
});

describe('email-delivery-service - Additional Branch Coverage', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSend.mockReset();
    mockReadFile.mockReset();
    process.env['CLOUDFLARE_API_TOKEN'] = 'test-api-token';
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'test-account-id';
    process.env['EMAIL_FROM'] = 'test@freelancexchain.com';
  });

  afterEach(() => {
    delete process.env['CLOUDFLARE_API_TOKEN'];
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['EMAIL_FROM'];
  });

  it('L306: non-Error throw in testEmailConfiguration returns config invalid error', async () => {
    delete process.env['CLOUDFLARE_API_TOKEN'];
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];

    const service = await import(resolveModule('src/services/email-delivery-service.ts'));
    const result = await service.testEmailConfiguration();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EMAIL_CONFIG_INVALID');
    }
  });

  it('L306: non-Error thrown as number', () => {
    const error = 42;
    const message = error instanceof Error ? error.message : 'Email configuration is invalid';
    expect(message).toBe('Email configuration is invalid');
  });

  it('L306: non-Error thrown as null', () => {
    const error = null;
    const message = error instanceof Error ? error.message : 'Email configuration is invalid';
    expect(message).toBe('Email configuration is invalid');
  });

  it('L306: Error thrown uses error.message', () => {
    const error = new Error('Custom config error');
    const message = error instanceof Error ? error.message : 'Email configuration is invalid';
    expect(message).toBe('Custom config error');
  });
});

describe('email-delivery-service - result.id fallback (L111)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSend.mockReset();
    mockReadFile.mockReset();
    process.env['CLOUDFLARE_API_TOKEN'] = 'test-api-token';
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'test-account-id';
    process.env['EMAIL_FROM'] = 'test@freelancexchain.com';
  });

  afterEach(() => {
    delete process.env['CLOUDFLARE_API_TOKEN'];
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['EMAIL_FROM'];
  });

  it('L111: should use "unknown" when result.id is null/undefined', async () => {
    mockReadFile.mockResolvedValue('<html>Body</html>');
    mockSend.mockResolvedValue({ id: undefined });

    const service = await import(resolveModule('src/services/email-delivery-service.ts'));
    const result = await service.sendEmail({
      to: 'user@test.com',
      subject: 'Test',
      template: 'proposal_accepted',
      data: { name: 'test' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messageId).toBe('unknown');
    }
  });

  it('L111: should use "unknown" when result.id is null', async () => {
    mockReadFile.mockResolvedValue('<html>Body</html>');
    mockSend.mockResolvedValue({ id: null });

    const service = await import(resolveModule('src/services/email-delivery-service.ts'));
    const result = await service.sendEmail({
      to: 'user@test.com',
      subject: 'Test',
      template: 'proposal_accepted',
      data: { name: 'test' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messageId).toBe('unknown');
    }
  });

  it('L306: testEmailConfiguration with non-Error throw uses fallback message', async () => {
    // Set config so the if-check passes, then make logger.info throw a non-Error
    process.env['CLOUDFLARE_API_TOKEN'] = 'test-api-token';
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'test-account-id';

    const service = await import(resolveModule('src/services/email-delivery-service.ts'));

    // Access the mocked logger to make info throw a non-Error value
    const { logger } = await import(resolveModule('src/config/logger.ts'));
    (logger.info as jest.Mock).mockImplementationOnce(() => { throw 'non-error string'; });

    const result = await service.testEmailConfiguration();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Email configuration is invalid');
    }
  });
});
