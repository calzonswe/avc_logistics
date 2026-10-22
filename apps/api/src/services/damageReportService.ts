// Damage report creation (shared by the REST route and the offline sync
// batch — ADR 0002: a report created offline must trigger the same
// condition-based maintenance task).
import { db } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { emitAppEvent, managerUserIds } from './events.js';

export type DamageSeverity = 'minor' | 'major' | 'critical';

// SLA for the auto-created condition-based tasks (documented in ticket 06).
const TASK_SLA_MS: Record<string, number> = {
  major: 48 * 3600 * 1000,
  critical: 24 * 3600 * 1000,
};

export interface CreateDamageReportInput {
  containerId: string;
  severity: DamageSeverity;
  description: string;
  photos?: Array<{ url: string; caption?: string; taken_at?: string }>;
  reportedBy: string;
  /** The client-generated id (ADR 0002: temp ids) — the server keeps it. */
  id?: string;
}

export interface CreateDamageReportResult {
  report: Record<string, unknown>;
  maintenanceTaskId: string | null;
}

export async function createDamageReport(
  input: CreateDamageReportInput
): Promise<CreateDamageReportResult> {
  const container = await db
    .selectFrom('containers')
    .select(['id', 'current_site_id', 'status'])
    .where('id', '=', input.containerId)
    .where('status', '!=', 'retired')
    .executeTakeFirst();
  if (!container) throw new AppError('Container hittades inte', 'NOT_FOUND', 404);

  const report = await db
    .insertInto('damage_reports')
    .values({
      ...(input.id ? { id: input.id } : {}),
      container_id: container.id,
      reported_by: input.reportedBy,
      severity: input.severity,
      description: input.description,
      // pg sends JS arrays as Postgres array literals; jsonb needs a JSON string.
      photos: JSON.stringify(input.photos ?? []),
      status: 'open',
    } as any)
    .returningAll()
    .executeTakeFirstOrThrow();

  // major/critical create a condition-based maintenance task.
  let maintenanceTaskId: string | null = null;
  if (input.severity in TASK_SLA_MS) {
    const task = await db
      .insertInto('maintenance_tasks')
      .values({
        container_id: container.id,
        type: 'condition_based',
        status: 'due',
        scheduled_for: new Date(Date.now() + TASK_SLA_MS[input.severity]),
        description: `Tillståndsbaserat underhåll utlöst av ${input.severity} skaderapport: ${input.description}`,
        created_by: input.reportedBy,
        damage_report_id: report.id,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();
    maintenanceTaskId = task.id;
  }

  // Event 3: a damage report was created → the managers are informed.
  const managers = await managerUserIds();
  await emitAppEvent({
    type: 'damage_reported',
    userIds: managers,
    title: `Ny skaderapport (${input.severity})`,
    message: input.description,
    related_entity_type: 'container',
    related_entity_id: container.id,
    site_id: container.current_site_id,
    data: { severity: input.severity, report_id: report.id, container_id: container.id },
  });

  return { report: report as unknown as Record<string, unknown>, maintenanceTaskId };
}
