// Company Routes - read-only list of the internal departments owning containers
// (companies are managed via SQL/seed for now; the UI consumes this for selects)
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db } from '../db/index.js';

export async function companyRoutes(app: FastifyInstance, _options: FastifyPluginOptions) {
  app.get(
    '/',
    async () => {
      const companies = await db
        .selectFrom('companies')
        .select(['id', 'name', 'description', 'created_at', 'updated_at'])
        .orderBy('name')
        .execute();

      const countRows = await db
        .selectFrom('containers')
        .select(['owning_company_id', (eb) => eb.fn.count('id').as('count')])
        .where('status', '!=', 'retired')
        .groupBy('owning_company_id')
        .execute();

      const countByCompany = new Map(countRows.map((r) => [r.owning_company_id, Number(r.count)]));

      return {
        data: companies.map((c) => ({ ...c, container_count: countByCompany.get(c.id) ?? 0 })),
        meta: { page: 1, limit: companies.length, total: companies.length, totalPages: 1 },
      };
    }
  );
}
