import { z } from 'zod';

const queryVariantSchema = z.object({ sql: z.string().min(1), plan: z.string().min(1) });
const querySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  indexExpression: z.string().min(1).optional(),
  normal: queryVariantSchema,
  incident: queryVariantSchema.optional(),
  indexed: queryVariantSchema.optional(),
});

export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    version: z.enum(['1.0.0', '2.0.0']),
    title: z.string().min(1),
    service: z.string().min(1),
    briefing: z.string().min(1),
    databaseCapacity: z.number().positive(),
    apiCapacity: z.number().positive(),
    baselineRps: z.number().positive(),
    incident: z.object({
      kind: z
        .enum(['query-regression', 'row-lock', 'workload-contention'])
        .default('query-regression'),
      productWork: z.number().positive(),
      queryEndpoint: z.string().optional(),
      queryWorkMultiplier: z.number().positive().default(1),
      backgroundWork: z.number().nonnegative().default(0),
      deployedVersion: z.string(),
      checkoutDelayMs: z.number().nonnegative().default(0),
      checkoutWorkMultiplier: z.number().positive().default(1),
    }),
    checkoutSegments: z
      .array(
        z.object({
          sku: z.string(),
          category: z.string(),
          share: z.number().positive().max(1),
          lockAffected: z.boolean(),
        }),
      )
      .refine(
        (segments) =>
          Math.abs(segments.reduce((sum, segment) => sum + segment.share, 0) - 1) < 0.001,
        'Checkout shares must sum to one',
      )
      .optional(),
    initialLogs: z
      .array(
        z.object({
          at: z.number().int(),
          kind: z.enum(['INFO', 'WARN', 'ERROR']),
          message: z.string(),
        }),
      )
      .optional(),
    initialEvents: z
      .array(
        z.object({
          at: z.number().int(),
          kind: z.enum(['baseline', 'deploy', 'alert', 'customer', 'job']),
          message: z.string(),
        }),
      )
      .optional(),
    endpoints: z
      .array(
        z.object({
          path: z.string(),
          share: z.number().positive().max(1),
          work: z.number().positive(),
          queries: z.array(querySchema).min(1),
        }),
      )
      .min(1),
    rootCause: z.string(),
    explanation: z.string(),
    alternatives: z.array(z.string()).min(1),
  })
  .refine(
    (s) => Math.abs(s.endpoints.reduce((sum, e) => sum + e.share, 0) - 1) < 0.001,
    'Endpoint shares must sum to one',
  );

export type Scenario = z.infer<typeof scenarioSchema>;
