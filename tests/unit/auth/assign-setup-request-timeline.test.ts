import { describe, expect, it } from 'vitest';
import { appendSetupRequestTimeline } from '../../../apps/auth/src/device-setup-request.repository';
import { InMemoryDeviceSetupRequestRepository } from '../../../apps/auth/src/in-memory-device-setup-request.repository';

describe('Assigning a device setup request', () => {
  // Approve and reject both append their transition. Assign not doing so left
  // the drawer's timeline ending at "Approved" on a request already in progress.
  it('records the in_progress step on the timeline', async () => {
    const repo = new InMemoryDeviceSetupRequestRepository();
    const [request] = await repo.findAll({});

    await repo.assign(
      request.id,
      'admin-1',
      appendSetupRequestTimeline(request, 'in_progress', null),
    );

    const updated = await repo.findById(request.id);
    expect(updated?.status).toBe('in_progress');
    expect(updated?.assignedTo).toBe('admin-1');
    expect(updated?.timeline.at(-1)).toMatchObject({ status: 'in_progress', note: null });
    expect(updated?.timeline.length).toBe(request.timeline.length + 1);
  });
});
