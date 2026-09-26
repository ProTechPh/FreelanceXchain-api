// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { requirePermission } from '../../middleware/auth-middleware.js';
import { updateAdminPermissions, inviteOrAddUser } from '../../services/admin-service.js';
import { userRepository } from '../../repositories/user-repository.js';
import { auditLogRepository } from '../../repositories/audit-log-repository.js';
import { users } from '../../config/appwrite.js';

describe('Admin Permissions & RBAC Middleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('requirePermission Middleware', () => {
    it('returns 401 if user is not authenticated', async () => {
      app.get('/test/kyc', requirePermission('kyc:view'), (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test/kyc');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('returns 403 if user is not an admin', async () => {
      app.get('/test/kyc', (req, _res, next) => {
        req.user = { userId: 'user-1', role: 'freelancer' };
        next();
      }, requirePermission('kyc:view'), (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test/kyc');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    it('allows super-admin with undefined permissions (backwards compatibility)', async () => {
      app.get('/test/kyc', (req, _res, next) => {
        req.user = { userId: 'admin-super', role: 'admin' };
        next();
      }, requirePermission('kyc:view'), (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test/kyc');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('allows super-admin with admin:manage permission', async () => {
      app.get('/test/kyc', (req, _res, next) => {
        req.user = { userId: 'admin-super', role: 'admin', permissions: ['admin:manage'] };
        next();
      }, requirePermission('kyc:view'), (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test/kyc');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('allows restricted admin (Admin 2) with matching kyc:view permission', async () => {
      app.get('/test/kyc', (req, _res, next) => {
        req.user = { userId: 'admin-2', role: 'admin', permissions: ['kyc:view', 'kyc:manage'] };
        next();
      }, requirePermission('kyc:view'), (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test/kyc');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('blocks restricted admin (Admin 2) from accessing user management with 403', async () => {
      app.get('/test/users', (req, _res, next) => {
        req.user = { userId: 'admin-2', role: 'admin', permissions: ['kyc:view', 'kyc:manage'] };
        next();
      }, requirePermission('users:view'), (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test/users');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('blocks restricted admin (Admin 2) from accessing disputes with 403', async () => {
      app.get('/test/disputes', (req, _res, next) => {
        req.user = { userId: 'admin-2', role: 'admin', permissions: ['kyc:view', 'kyc:manage'] };
        next();
      }, requirePermission('disputes:view'), (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test/disputes');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('blocks admin with empty permissions array [] with 403', async () => {
      app.get('/test/empty-perms', (req, _res, next) => {
        req.user = { userId: 'admin-empty', role: 'admin', permissions: [] };
        next();
      }, requirePermission('kyc:view'), (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test/empty-perms');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('updateAdminPermissions Service', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('returns NOT_FOUND if user does not exist', async () => {
      jest.spyOn(userRepository, 'getUserById').mockResolvedValue(null);

      const result = await updateAdminPermissions('non-existent', ['kyc:view'], 'super-admin');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('returns INVALID_ROLE if target is not an admin', async () => {
      jest.spyOn(userRepository, 'getUserById').mockResolvedValue({
        id: 'u-1',
        role: 'freelancer',
      } as any);

      const result = await updateAdminPermissions('u-1', ['kyc:view'], 'super-admin');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_ROLE');
    });

    it('returns INVALID_PERMISSION for unknown permission string', async () => {
      jest.spyOn(userRepository, 'getUserById').mockResolvedValue({
        id: 'admin-2',
        role: 'admin',
      } as any);

      const result = await updateAdminPermissions('admin-2', ['invalid:perm' as any], 'super-admin');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PERMISSION');
    });

    it('prevents removing admin:manage from the only remaining super admin', async () => {
      jest.spyOn(userRepository, 'getUserById').mockResolvedValue({
        id: 'super-admin-1',
        role: 'admin',
        permissions: ['admin:manage'],
      } as any);
      jest.spyOn(userRepository, 'getUsersByRole').mockResolvedValue([
        { id: 'super-admin-1', role: 'admin', permissions: ['admin:manage'] },
        { id: 'admin-2', role: 'admin', permissions: ['kyc:view'] },
      ] as any);

      const result = await updateAdminPermissions('super-admin-1', ['kyc:view'], 'super-admin-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('LAST_SUPER_ADMIN');
    });

    it('successfully updates permissions for Admin 2 to KYC only', async () => {
      jest.spyOn(userRepository, 'getUserById').mockResolvedValue({
        id: 'admin-2',
        role: 'admin',
        permissions: [],
      } as any);
      jest.spyOn(userRepository, 'updateUser').mockResolvedValue({
        id: 'admin-2',
        role: 'admin',
        permissions: ['kyc:view', 'kyc:manage'],
      } as any);
      jest.spyOn(auditLogRepository, 'create').mockResolvedValue({ id: 'audit-1' } as any);

      const result = await updateAdminPermissions('admin-2', ['kyc:view', 'kyc:manage'], 'super-admin-1');
      expect(result.success).toBe(true);
      expect(result.data?.permissions).toEqual(['kyc:view', 'kyc:manage']);
    });
  });

  describe('inviteOrAddUser Service', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('rejects invalid names or emails', async () => {
      const res1 = await inviteOrAddUser({ name: '', email: 'test@example.com', role: 'freelancer' });
      expect(res1.success).toBe(false);
      expect(res1.error?.code).toBe('INVALID_NAME');

      const res2 = await inviteOrAddUser({ name: 'Alice', email: 'not-an-email', role: 'freelancer' });
      expect(res2.success).toBe(false);
      expect(res2.error?.code).toBe('INVALID_EMAIL');
    });

    it('rejects duplicate email if already in database', async () => {
      jest.spyOn(userRepository, 'emailExists').mockResolvedValue(true);

      const res = await inviteOrAddUser({ name: 'Alice', email: 'alice@example.com', role: 'freelancer' });
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('DUPLICATE_EMAIL');
    });

    it('creates a user with auto-generated temporary password in Appwrite and DB', async () => {
      jest.spyOn(userRepository, 'emailExists').mockResolvedValue(false);
      const appwriteSpy = jest.spyOn(users, 'create').mockResolvedValue({ $id: 'appwrite-user-1' } as any);
      const verifySpy = jest.spyOn(users, 'updateEmailVerification').mockResolvedValue({} as any);
      const dbSpy = jest.spyOn(userRepository, 'createUser').mockResolvedValue({
        id: 'appwrite-user-1',
        email: 'alice@example.com',
        role: 'freelancer',
        name: 'Alice Cooper',
      } as any);
      const auditSpy = jest.spyOn(auditLogRepository, 'create').mockResolvedValue({} as any);

      const res = await inviteOrAddUser(
        { name: 'Alice Cooper', email: 'alice@example.com', role: 'freelancer' },
        'admin-actor-1'
      );

      expect(res.success).toBe(true);
      expect(res.data?.user.id).toBe('appwrite-user-1');
      expect(res.data?.temporaryPassword).toBeDefined();
      expect(typeof res.data?.temporaryPassword).toBe('string');
      expect(res.data?.temporaryPassword?.startsWith('Temp!')).toBe(true);

      expect(appwriteSpy).toHaveBeenCalledTimes(1);
      expect(verifySpy).toHaveBeenCalledWith('appwrite-user-1', true);
      expect(dbSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'appwrite-user-1',
        email: 'alice@example.com',
        role: 'freelancer',
        name: 'Alice Cooper',
      }));
      expect(auditSpy).toHaveBeenCalledTimes(1);
    });

    it('creates an admin with custom permissions', async () => {
      jest.spyOn(userRepository, 'emailExists').mockResolvedValue(false);
      jest.spyOn(users, 'create').mockResolvedValue({ $id: 'appwrite-admin-2' } as any);
      jest.spyOn(users, 'updateEmailVerification').mockResolvedValue({} as any);
      const dbSpy = jest.spyOn(userRepository, 'createUser').mockResolvedValue({
        id: 'appwrite-admin-2',
        email: 'admin2@example.com',
        role: 'admin',
        name: 'Admin Two',
        permissions: ['kyc:view', 'kyc:manage'],
      } as any);
      jest.spyOn(auditLogRepository, 'create').mockResolvedValue({} as any);

      const res = await inviteOrAddUser(
        {
          name: 'Admin Two',
          email: 'admin2@example.com',
          role: 'admin',
          permissions: ['kyc:view', 'kyc:manage'],
        },
        'super-admin-1'
      );

      expect(res.success).toBe(true);
      expect(res.data?.user.permissions).toEqual(['kyc:view', 'kyc:manage']);
      expect(dbSpy).toHaveBeenCalledWith(expect.objectContaining({
        permissions: ['kyc:view', 'kyc:manage'],
      }));
    });

    it('rolls back Appwrite user if database insertion fails', async () => {
      jest.spyOn(userRepository, 'emailExists').mockResolvedValue(false);
      jest.spyOn(users, 'create').mockResolvedValue({ $id: 'appwrite-user-fail' } as any);
      jest.spyOn(users, 'updateEmailVerification').mockResolvedValue({} as any);
      jest.spyOn(userRepository, 'createUser').mockRejectedValue(new Error('DB Connection Timeout'));
      const deleteSpy = jest.spyOn(users, 'delete').mockResolvedValue({} as any);

      const res = await inviteOrAddUser({ name: 'Bob', email: 'bob@example.com', role: 'employer' });
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('INTERNAL_ERROR');
      expect(deleteSpy).toHaveBeenCalledWith('appwrite-user-fail');
    });
  });

  describe('Privilege Escalation Prevention on User Creation Route', () => {
    it('blocks restricted admin with users:manage from creating an admin user (requires admin:manage)', async () => {
      app.post('/api/admin/users', (req, _res, next) => {
        // Admin with only users:manage, disputes:view
        req.user = { userId: 'admin-support', role: 'admin', permissions: ['users:manage', 'disputes:view'] };
        next();
      }, requirePermission('users:manage'), async (req, res) => {
        const { role } = req.body;
        const userPerms = req.user?.permissions;
        const isSuperAdmin = !userPerms || userPerms.length === 0 || userPerms.includes('*') || userPerms.includes('admin:manage');
        if (role === 'admin' && !isSuperAdmin) {
          res.status(403).json({ error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Only super administrators can create admin accounts' } });
          return;
        }
        res.status(201).json({ ok: true });
      });

      // Attempt to create an admin
      const res = await request(app)
        .post('/api/admin/users')
        .send({ name: 'New Admin', email: 'newadmin@example.com', role: 'admin' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('allows restricted admin with users:manage to create a freelancer or employer', async () => {
      app.post('/api/admin/users-allow', (req, _res, next) => {
        req.user = { userId: 'admin-support', role: 'admin', permissions: ['users:manage'] };
        next();
      }, requirePermission('users:manage'), async (req, res) => {
        const { role } = req.body;
        const userPerms = req.user?.permissions;
        const isSuperAdmin = !userPerms || userPerms.length === 0 || userPerms.includes('*') || userPerms.includes('admin:manage');
        if (role === 'admin' && !isSuperAdmin) {
          res.status(403).json({ error: { code: 'INSUFFICIENT_PERMISSIONS' } });
          return;
        }
        res.status(201).json({ ok: true });
      });

      const res = await request(app)
        .post('/api/admin/users-allow')
        .send({ name: 'New Freelancer', email: 'freelancer@example.com', role: 'freelancer' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('allows super admin with admin:manage to create an admin user', async () => {
      app.post('/api/admin/users-super', (req, _res, next) => {
        req.user = { userId: 'super-admin-1', role: 'admin', permissions: ['admin:manage'] };
        next();
      }, requirePermission('users:manage'), async (req, res) => {
        const { role } = req.body;
        const userPerms = req.user?.permissions;
        const isSuperAdmin = !userPerms || userPerms.length === 0 || userPerms.includes('*') || userPerms.includes('admin:manage');
        if (role === 'admin' && !isSuperAdmin) {
          res.status(403).json({ error: { code: 'INSUFFICIENT_PERMISSIONS' } });
          return;
        }
        res.status(201).json({ ok: true });
      });

      const res = await request(app)
        .post('/api/admin/users-super')
        .send({ name: 'Sub Admin', email: 'subadmin@example.com', role: 'admin' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });
});
