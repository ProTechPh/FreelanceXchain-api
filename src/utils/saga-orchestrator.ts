import { logger } from '../config/logger.js';

export interface SagaStep<TContext> {
  name: string;
  execute: (context: TContext) => Promise<void>;
  compensate?: (context: TContext, error: unknown) => Promise<void>;
}

export type SagaExecutionResult<TContext> =
  | { success: true; context: TContext }
  | { success: false; failedStep: string; error: unknown; context: TContext };

/**
 * Clean Code Saga Orchestrator for managing multi-step operations with backward compensation.
 * Guarantees that if any step fails, all preceding executed steps with compensation
 * handlers are invoked in reverse order.
 */
export class SagaOrchestrator<TContext> {
  private readonly steps: SagaStep<TContext>[] = [];

  constructor(private readonly sagaName: string) {}

  addStep(step: SagaStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  async execute(context: TContext): Promise<SagaExecutionResult<TContext>> {
    const executedSteps: SagaStep<TContext>[] = [];

    for (const step of this.steps) {
      try {
        logger.debug(`[Saga:${this.sagaName}] Executing step: ${step.name}`);
        await step.execute(context);
        executedSteps.push(step);
      } catch (stepError) {
        logger.error(`[Saga:${this.sagaName}] Step failed: ${step.name}`, {
          error: stepError instanceof Error ? stepError.message : String(stepError),
        });

        // Compensate executed steps in reverse order
        for (const executedStep of [...executedSteps].reverse()) {
          if (executedStep.compensate) {
            try {
              logger.warn(`[Saga:${this.sagaName}] Compensating step: ${executedStep.name}`);
              await executedStep.compensate(context, stepError);
            } catch (compensationError) {
              logger.error(`[Saga:${this.sagaName}] Compensation failed for step: ${executedStep.name}`, {
                error: compensationError instanceof Error ? compensationError.message : String(compensationError),
              });
            }
          }
        }

        return {
          success: false,
          failedStep: step.name,
          error: stepError,
          context,
        };
      }
    }

    logger.debug(`[Saga:${this.sagaName}] Successfully completed all steps`);
    return { success: true, context };
  }
}
