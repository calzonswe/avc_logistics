import Fastify from 'fastify';
import { authRoutes } from './src/routes/auth.ts';

async function test() {
  const app = Fastify({ logger: true });
  try {
    await app.register(authRoutes); // No prefix
    console.log('Auth routes registered successfully');
  } catch (err) {
    console.error('Error registering auth routes:', err);
  }
  await app.ready();
  
  // Try to inject a request to the login endpoint
  const response = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { email: 'admin@avc.local', password: 'admin123' }
  });
  console.log('Login response:', response.statusCode, response.payload);
  
  await app.close();
}

test().catch(console.error);