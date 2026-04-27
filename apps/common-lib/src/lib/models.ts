import {z} from 'zod';

// ---- API request and response models
export const CreatePuzzleRequest = z.object({
    name: z.string().optional(),
});

export type CreatePuzzleRequest = z.infer<typeof CreatePuzzleRequest>;

export const CreatePuzzleResponse = z.object({
    id: z.uuid(),
});

export type CreatePuzzleResponse = z.infer<typeof CreatePuzzleResponse>;

export const UserInfoResponse = z.object({
    email: z.string(),
    name: z.string().optional(),
    familyName: z.string().optional(),
    givenName: z.string().optional(),
    picture: z.string().optional(),
    exp: z.number(),
});

export type UserInfoResponse = z.infer<typeof UserInfoResponse>;