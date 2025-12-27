import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './env.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Blockchain Freelance Marketplace API',
      version: '1.0.0',
      description: 'A decentralized freelance marketplace with AI skill matching and blockchain payments',
      contact: {
        name: 'API Support',
      },
    },
    servers: config.server.nodeEnv === 'production'
      ? [
        {
          url: `http://localhost:${config.server.port}`,
          description: 'Production server',
        },
      ]
      : [
        {
          url: `http://localhost:${config.server.port}`,
          description: 'Development server',
        },
      ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                      value: {},
                    },
                  },
                },
              },
            },
            timestamp: { type: 'string', format: 'date-time' },
            requestId: { type: 'string', format: 'uuid' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['freelancer', 'employer', 'admin'] },
            walletAddress: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        FreelancerProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            bio: { type: 'string' },
            hourlyRate: { type: 'number' },
            skills: {
              type: 'array',
              items: { $ref: '#/components/schemas/SkillReference' },
            },
            experience: {
              type: 'array',
              items: { $ref: '#/components/schemas/WorkExperience' },
            },
            availability: { type: 'string', enum: ['available', 'busy', 'unavailable'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        SkillReference: {
          type: 'object',
          properties: {
            skillId: { type: 'string', format: 'uuid' },
            skillName: { type: 'string' },
            categoryId: { type: 'string', format: 'uuid' },
            yearsOfExperience: { type: 'number' },
          },
        },
        WorkExperience: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            company: { type: 'string' },
            description: { type: 'string' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date', nullable: true },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            employerId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            requiredSkills: {
              type: 'array',
              items: { $ref: '#/components/schemas/SkillReference' },
            },
            budget: { type: 'number' },
            deadline: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['draft', 'open', 'in_progress', 'completed', 'cancelled'] },
            milestones: {
              type: 'array',
              items: { $ref: '#/components/schemas/Milestone' },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Milestone: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            amount: { type: 'number' },
            dueDate: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'submitted', 'approved', 'disputed'] },
          },
        },
        Proposal: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            freelancerId: { type: 'string', format: 'uuid' },
            coverLetter: { type: 'string' },
            proposedRate: { type: 'number' },
            estimatedDuration: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'withdrawn'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Contract: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            proposalId: { type: 'string', format: 'uuid' },
            freelancerId: { type: 'string', format: 'uuid' },
            employerId: { type: 'string', format: 'uuid' },
            escrowAddress: { type: 'string' },
            totalAmount: { type: 'number' },
            status: { type: 'string', enum: ['active', 'completed', 'disputed', 'cancelled'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Skill: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            categoryId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        SkillCategory: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            type: {
              type: 'string',
              enum: [
                'proposal_received',
                'proposal_accepted',
                'proposal_rejected',
                'milestone_submitted',
                'milestone_approved',
                'payment_released',
                'dispute_created',
                'dispute_resolved',
                'rating_received',
              ],
            },
            title: { type: 'string' },
            message: { type: 'string' },
            data: { type: 'object' },
            isRead: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            totalCount: { type: 'number' },
            pageSize: { type: 'number' },
            hasMore: { type: 'boolean' },
            continuationToken: { type: 'string' },
          },
        },
      },
    },
  },
  apis: process.env['NODE_ENV'] === 'production'
    ? [] // Disable scanning in production to avoid crashing serverless functions where file paths differ
    : ['./src/routes/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
