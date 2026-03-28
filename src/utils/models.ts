import {z} from 'zod';

export const ModelResponse = z.object({
    jsx: z.string().optional(),
    explanation: z.string().optional(),
});

export type ModelResponse = z.infer<typeof ModelResponse>;