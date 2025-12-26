
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
const { loginWithSupabase } = await import('../auth-service');
const { userRepository } = await import('../../repositories/user-repository');
const { getSupabaseClient } = await import('../../config/supabase');

describe('AuthService - OAuth Login', () => {
    const mockSupabase = {
        auth: {
            getUser: jest.fn(),
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabase);
    });

    it('should successfully login and create a new user if not exists', async () => {
        // Mock Supabase response
        (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
            data: {
                user: {
                    email: 'test@example.com',
                    user_metadata: { role: 'freelancer' },
                },
            },
            error: null,
        } as never);

        // Mock User Repository response for "not found"
        (userRepository.getUserByEmail as jest.Mock).mockResolvedValue(null as never);
        (userRepository.createUser as jest.Mock).mockResolvedValue({
            id: 'new_user_id',
            email: 'test@example.com',
            role: 'freelancer',
            created_at: new Date(),
        } as never);

        const result = await loginWithSupabase('valid_supabase_token');

        expect(mockSupabase.auth.getUser).toHaveBeenCalledWith('valid_supabase_token');
        expect(userRepository.getUserByEmail).toHaveBeenCalledWith('test@example.com');
        expect(userRepository.createUser).toHaveBeenCalled();
        expect(result).toHaveProperty('accessToken', 'mock_token');
        expect(result).toHaveProperty('user');
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
        } as never);

        const result = await loginWithSupabase('valid_supabase_token');

        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(result).toHaveProperty('accessToken', 'mock_token');
        expect(result).toHaveProperty('user');
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
