import {z} from 'zod';

export const DebugRequest = z.object({
    jsx: z.string(),
    lastError: z.string(),
    containerLogs: z.string().optional(),
});

export type DebugRequest = z.infer<typeof DebugRequest>;