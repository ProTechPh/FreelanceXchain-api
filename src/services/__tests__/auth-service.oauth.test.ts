
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Define mocks BEFORE imports using unstable_mockModule
jest.unstable_mockModule('../../repositories/user-repository', () => ({
    userRepository: {
        getUserByEmail: jest.fn(),
        createUser: jest.fn(),
        getUserById: jest.fn(),
        emailExists: jest.fn(),
    },
}));

jest.unstable_mockModule('../../config/supabase', () => ({
    __esModule: true,
    getSupabaseClient: jest.fn(),
}));

jest.unstable_mockModule('bcrypt', () => {
    const mock = {
        hash: jest.fn().mockResolvedValue('hashed_password' as never),
        compare: jest.fn().mockResolvedValue(true as never),
    };
    return {
        default: mock,
        ...mock,
    };
});

jest.unstable_mockModule('jsonwebtoken', () => {
    const mock = {
        sign: jest.fn().mockReturnValue('mock_token'),
        verify: jest.fn(),
    };
    return {
        default: mock,
        ...mock,
    };
});

// Dynamic imports
const { loginWithSupabase, registerWithSupabase, getOAuthUrl } = await import('../auth-service');
const { userRepository } = await import('../../repositories/user-repository');
const { getSupabaseClient } = await import('../../config/supabase');

describe('AuthService - OAuth Login', () => {
    const mockSupabase = {
        auth: {
            getUser: jest.fn(),
            signInWithOAuth: jest.fn(),
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
    });

    it('should return REQUIRE_REGISTRATION for new user', async () => {
        // Mock Supabase response
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
            data: {
                user: {
                    email: 'new_user@example.com',
                },
            },
            error: null,
        } as never);

        // Mock User Repository response for "not found"
        (userRepository.getUserByEmail as jest.Mock).mockResolvedValue(null as never);

        const result = await loginWithSupabase('valid_supabase_token');

        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(result).toHaveProperty('code', 'AUTH_REQUIRE_REGISTRATION');
    });

    it('should successfully login existing user', async () => {
        // Mock Supabase response
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
            data: {
                user: {
                    email: 'existing@example.com',
                },
            },
            error: null,
        } as never);

        // Mock User Repository response for "found"
        (userRepository.getUserByEmail as jest.Mock).mockResolvedValue({
            id: 'existing_user_id',
            email: 'existing@example.com',
            role: 'employer',
            created_at: new Date(),
        } as never);

        const result = await loginWithSupabase('valid_supabase_token');

        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(result).toHaveProperty('accessToken', 'mock_token');
        if ('user' in result) {
            expect(result.user.id).toBe('existing_user_id');
        }
    });

    it('should return error for invalid supabase token', async () => {
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
        } as never);

        const result = await loginWithSupabase('invalid_token');

        expect(result).toHaveProperty('code', 'INVALID_TOKEN');
    });
});

describe('AuthService - registerWithSupabase', () => {
    const mockSupabase = {
        auth: {
            getUser: jest.fn(),
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
    });

    it('should create new user with valid role', async () => {
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
            data: {
                user: {
                    email: 'new_employer@example.com',
                },
            },
            error: null,
        } as never);

        (userRepository.getUserByEmail as jest.Mock).mockResolvedValue(null as never);
        (userRepository.createUser as jest.Mock).mockResolvedValue({
            id: 'new_employer_id',
            email: 'new_employer@example.com',
            role: 'employer',
            created_at: new Date(),
        } as never);

        const result = await registerWithSupabase('valid_token', 'employer');

        expect(userRepository.createUser).toHaveBeenCalledWith(expect.objectContaining({
            role: 'employer',
            email: 'new_employer@example.com',
        }));
        expect(result).toHaveProperty('user');
        if ('user' in result) {
            expect(result.user.role).toBe('employer');
        }
    });

    it('should login if user already exists (idempotency)', async () => {
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
            data: {
                user: {
                    email: 'existing@example.com',
                },
            },
            error: null,
        } as never);

        (userRepository.getUserByEmail as jest.Mock).mockResolvedValue({
            id: 'existing_id',
            email: 'existing@example.com',
            role: 'freelancer',
        } as never);

        const result = await registerWithSupabase('valid_token', 'employer'); // try to register as employer

        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(result).toHaveProperty('user');
        if ('user' in result) {
            expect(result.user.role).toBe('freelancer'); // Role remains unchanged
        }
    });
});

describe('AuthService - getOAuthUrl', () => {
    const mockSupabase = {
        auth: {
            signInWithOAuth: jest.fn(),
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
    });

    it('should return valid OAuth URL', async () => {
        (mockSupabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
            data: { url: 'https://example.com/auth' },
            error: null,
        } as never);

        await getOAuthUrl('google' as any);

        expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
            options: expect.objectContaining({
                redirectTo: 'http://localhost:3000/api/auth/callback',
            }),
        }));
    });
});
