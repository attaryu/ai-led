import { JobsController } from './jobs.controller';

describe('JobsController', () => {
  it('GET :id returns the job status/result from JobsService.getJob', async () => {
    const view = { id: 'j1', status: 'COMPLETED', result: { status: 'completed', hasil: [] } };
    const jobsService = { getJob: jest.fn().mockResolvedValue(view), cancel: jest.fn() };
    const controller = new JobsController(jobsService as never);

    await expect(controller.get('j1')).resolves.toEqual(view);
    expect(jobsService.getJob).toHaveBeenCalledWith('j1');
  });

  it('POST :id/cancel still answers cancel_requested', async () => {
    const jobsService = { getJob: jest.fn(), cancel: jest.fn().mockResolvedValue(undefined) };
    const controller = new JobsController(jobsService as never);

    await expect(controller.cancel('j1')).resolves.toEqual({ status: 'cancel_requested' });
    expect(jobsService.cancel).toHaveBeenCalledWith('j1');
  });
});
