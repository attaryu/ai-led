import { JobType } from '@ai-led/db';
import { ASSESSMENT_QUEUE, QUEUE_NAME_BY_JOB_TYPE, QUEUE_NAMES } from './queue-names';

describe('QUEUE_NAME_BY_JOB_TYPE', () => {
  it('routes SETOR_LED to the assessment queue', () => {
    expect(QUEUE_NAME_BY_JOB_TYPE[JobType.SETOR_LED]).toBe(ASSESSMENT_QUEUE);
  });

  it('maps every JobType to a known queue', () => {
    for (const type of Object.values(JobType)) {
      expect(QUEUE_NAMES).toContain(QUEUE_NAME_BY_JOB_TYPE[type]);
    }
  });
});
