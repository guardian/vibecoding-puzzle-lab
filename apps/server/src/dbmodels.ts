import {z} from 'zod';

export const PuzzleStates = z.enum(['visible','hidden','replaced', 'blocked']);

export const PuzzleInfo = z.object({
    id: z.uuid(),
    name: z.string(),
    author: z.string(),
    model: z.string(),
    state: PuzzleStates,
    lastModified: z.string(),
    upvotes: z.number().optional(),
    downvotes: z.number().optional()
});

const PuzzleInfoUpdate = PuzzleInfo.partial();

export type PuzzleState = z.infer<typeof PuzzleStates>;
export type PuzzleInfo = z.infer<typeof PuzzleInfo>;
export type PuzzleInfoUpdate = z.infer<typeof PuzzleInfoUpdate>;