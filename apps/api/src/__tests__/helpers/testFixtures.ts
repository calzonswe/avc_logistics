// Shared test-fixture helpers.
//
// The Vitest files run in parallel against the same database, so every file
// must own its fixtures. The helpers make the setup idempotent: a previous run
// that was interrupted (or crashed) leaves rows behind, and the next run must
// clean them up instead of failing on a unique constraint.
import { db } from '../../db/index.js';

/**
 * Removes every leftover test container with the given prefix (and the rows
 * that reference it).
 *
 * The prefix matters: the test files run in parallel, so a file may only clean
 * up **its own** fixtures — deleting another file's container mid-test would
 * break it.
 */
export async function cleanTestContainers(prefix = 'TEST-'): Promise<void> {
  const testContainers = db
    .selectFrom('containers')
    .select('id')
    .where('container_number', 'like', `${prefix}%`);

  await db.deleteFrom('transport_order_containers').where('container_id', 'in', testContainers).execute();
  await db.deleteFrom('damage_reports').where('container_id', 'in', testContainers).execute();
  await db.deleteFrom('maintenance_tasks').where('container_id', 'in', testContainers).execute();
  await db.deleteFrom('containers').where('container_number', 'like', `${prefix}%`).execute();
}

/** Removes leftover notifications created by the event tests. */
export async function cleanTestNotifications(): Promise<void> {
  await db
    .deleteFrom('notifications')
    .where('title', 'like', '%testticket%')
    .execute()
    .catch(() => undefined);
}
