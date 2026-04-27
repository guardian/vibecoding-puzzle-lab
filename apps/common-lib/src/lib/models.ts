import {z} from 'zod';

export const CreatePuzzleRequest = z.object({
    name: z.string().optional(),
});

export type CreatePuzzleRequest = z.infer<typeof CreatePuzzleRequest>;