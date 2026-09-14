import { SagaOrchestrator } from '../saga-orchestrator.js';

describe('SagaOrchestrator', () => {
  it('should execute all steps sequentially when no errors occur', async () => {
    const executed: string[] = [];
    const saga = new SagaOrchestrator<{ count: number }>('test-saga');

    saga
      .addStep({
        name: 'step-1',
        execute: async (ctx) => {
          executed.push('step-1');
          ctx.count += 1;
        },
      })
      .addStep({
        name: 'step-2',
        execute: async (ctx) => {
          executed.push('step-2');
          ctx.count += 10;
        },
      });

    const result = await saga.execute({ count: 0 });

    expect(result.success).toBe(true);
    expect(executed).toEqual(['step-1', 'step-2']);
    if (result.success) {
      expect(result.context.count).toBe(11);
    }
  });

  it('should compensate executed steps in reverse order on failure', async () => {
    const actions: string[] = [];
    const saga = new SagaOrchestrator<{ log: string[] }>('failing-saga');

    saga
      .addStep({
        name: 'step-1',
        execute: async () => {
          actions.push('execute-1');
        },
        compensate: async () => {
          actions.push('compensate-1');
        },
      })
      .addStep({
        name: 'step-2',
        execute: async () => {
          actions.push('execute-2');
        },
        compensate: async () => {
          actions.push('compensate-2');
        },
      })
      .addStep({
        name: 'step-3',
        execute: async () => {
          actions.push('execute-3');
          throw new Error('Step 3 exploded');
        },
        compensate: async () => {
          actions.push('compensate-3');
        },
      });

    const result = await saga.execute({ log: actions });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failedStep).toBe('step-3');
      expect((result.error as Error).message).toBe('Step 3 exploded');
    }
    // Execution order: step-1, step-2, step-3 (fails)
    // Compensation order: compensate-2, compensate-1 (step-3 was not successfully executed)
    expect(actions).toEqual([
      'execute-1',
      'execute-2',
      'execute-3',
      'compensate-2',
      'compensate-1',
    ]);
  });

  it('should continue compensating remaining steps even if one compensation fails', async () => {
    const actions: string[] = [];
    const saga = new SagaOrchestrator<void>('resilient-compensation-saga');

    saga
      .addStep({
        name: 'step-1',
        execute: async () => {
          actions.push('exec-1');
        },
        compensate: async () => {
          actions.push('comp-1');
        },
      })
      .addStep({
        name: 'step-2',
        execute: async () => {
          actions.push('exec-2');
        },
        compensate: async () => {
          actions.push('comp-2');
          throw new Error('Compensation error in step 2');
        },
      })
      .addStep({
        name: 'step-3',
        execute: async () => {
          actions.push('exec-3');
          throw new Error('Fail step 3');
        },
      });

    const result = await saga.execute(undefined);

    expect(result.success).toBe(false);
    expect(actions).toEqual(['exec-1', 'exec-2', 'exec-3', 'comp-2', 'comp-1']);
  });
});
