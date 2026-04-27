import {z} from 'zod';

export const CreatePuzzleRequest = z.object({
    name: z.string().optional(),
});

export type CreatePuzzleRequest = z.infer<typeof CreatePuzzleRequest>;

export const CreatePuzzleResponse = z.object({
    id: z.uuid(),
});

export type CreatePuzzleResponse = z.infer<typeof CreatePuzzleResponse>;