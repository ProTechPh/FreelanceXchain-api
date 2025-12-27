// Use dynamic import to allow catching startup errors
let app: any;

export default async function handler(req: any, res: any) {
    try {
        if (!app) {
            const { createApp } = await import('../src/app.js');
            app = createApp();
        }
        return app(req, res);
    } catch (error: any) {
        console.error('Server initialization failed:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Server initialization failed',
            details: error.message,
            env: {
                NODE_ENV: process.env.NODE_ENV,
                HAS_SUPABASE_URL: !!process.env.SUPABASE_URL,
                HAS_JWT_SECRET: !!process.env.JWT_SECRET,
            }
        });
    }
}
