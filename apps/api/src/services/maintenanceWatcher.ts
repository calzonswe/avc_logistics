// Maintenance watcher — event 4 (maintenance task overdue → managers).
//
// The status 'overdue' is derived from `scheduled_for`; this sweep flips due
// tasks to 'overdue' and emits the event exactly once per task. It also covers
// tasks that were already overdue in the database (e.g. a backdated task).
import { db } from '../db/index.js';
import { emitAppEvent, managerUserIds } from './events.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Marks past-due tasks as overdue and notifies the managers. */
export async function sweepOverdueMaintenance(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const now = new Date();
    const overdue = await db
      .selectFrom('maintenance_tasks')
      .selectAll()
      .where('status', 'in', ['due', 'in_progress'])
      .where('scheduled_for', '<=', now)
      .execute();

    let handled = 0;
    for (const task of overdue) {
      await db
        .updateTable('maintenance_tasks')
        .set({ status: 'overdue', updated_at: now })
        .where('id', '=', task.id)
        .execute();

      // Only notify once per task.
      const existing = await db
        .selectFrom('notifications')
        .select('id')
        .where('related_entity_type', '=', 'maintenance_task')
        .where('related_entity_id', '=', task.id)
        .where('type', '=', 'maintenance_due')
        .executeTakeFirst();
      if (existing) continue;

      const container = await db
        .selectFrom('containers')
        .select(['container_number', 'current_site_id'])
        .where('id', '=', task.container_id)
        .executeTakeFirst();

      const managers = await managerUserIds();
      await emitAppEvent({
        type: 'maintenance_due',
        userIds: managers,
        title: `Underhåll försenat${container ? ` — ${container.container_number}` : ''}`,
        message: `Underhållsuppgiften var planerad ${new Date(task.scheduled_for).toLocaleString('sv-SE')}.`,
        related_entity_type: 'maintenance_task',
        related_entity_id: task.id,
        site_id: container?.current_site_id ?? null,
        data: { task_id: task.id, container_id: task.container_id },
      });
      handled++;
    }

    return handled;
  } finally {
    running = false;
  }
}

/** Starts the periodic sweep (called once at boot). */
export function startMaintenanceWatcher(intervalMs = 60_000): void {
  if (timer) return;
  // Run once at boot so a restart catches up on tasks that became overdue.
  void sweepOverdueMaintenance().catch((err) => console.error('Maintenance sweep failed:', err));
  timer = setInterval(() => {
    void sweepOverdueMaintenance().catch((err) => console.error('Maintenance sweep failed:', err));
  }, intervalMs);
  timer.unref?.();
}

export function stopMaintenanceWatcher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
