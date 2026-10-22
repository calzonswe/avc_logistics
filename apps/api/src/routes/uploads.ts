// Upload Routes - File uploads for photos, documents
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db/index.js';
import { createWriteStream } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB

export async function uploadRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  // Upload single file
  app.post(
    '/',
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Ingen fil uppladdad' } });
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(data.mimetype)) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Endast JPEG, PNG, WebP och PDF tillåtna' } });
      }

      if (data.file.bytesRead > MAX_FILE_SIZE) {
        return reply.code(400).send({ error: { code: 'FILE_TOO_LARGE', message: `Filen är för stor (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` } });
      }

      const filename = `${randomUUID()}${extname(data.filename)}`;
      const filepath = join(UPLOAD_DIR, filename);

      try {
        await pipeline(data.file, createWriteStream(filepath));
      } catch {
        return reply.code(500).send({ error: { code: 'UPLOAD_FAILED', message: 'Kunde inte spara filen' } });
      }

      const fileUrl = `/uploads/${filename}`;
      return { url: fileUrl, filename, mimetype: data.mimetype, size: data.file.bytesRead };
    }
  );

  // Upload multiple files
  app.post(
    '/multiple',
    async (request, reply) => {
      const files = [];
      const maxFiles = 10;

      for await (const data of request.files()) {
        if (files.length >= maxFiles) {
          return reply.code(400).send({ error: { code: 'TOO_MANY_FILES', message: `Max ${maxFiles} filer per uppladdning` } });
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(data.mimetype)) {
          return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: `Fil ${data.filename}: Endast JPEG, PNG, WebP och PDF tillåtna` } });
        }

        const filename = `${randomUUID()}${extname(data.filename)}`;
        const filepath = join(UPLOAD_DIR, filename);

        try {
          await pipeline(data.file, createWriteStream(filepath));
        } catch {
          return reply.code(500).send({ error: { code: 'UPLOAD_FAILED', message: `Kunde inte spara ${data.filename}` } });
        }

        files.push({ url: `/uploads/${filename}`, filename, mimetype: data.mimetype, size: data.file.bytesRead });
      }

      return { files };
    }
  );

  // Delete uploaded file
  app.delete<{ Params: { filename: string } }>(
    '/:filename',
    async (request, reply) => {
      const { unlink } = await import('fs/promises');
      const filepath = join(UPLOAD_DIR, request.params.filename);

      try {
        await unlink(filepath);
        return { success: true };
      } catch {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Fil hittades inte' } });
      }
    }
  );
}