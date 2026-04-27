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

export const PuzzleStates = z.enum(['draft','visible','hidden','replaced', 'blocked']);

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

export const PuzzleIndexResponse = z.object({
    status: z.string(),
    bundles: z.array(PuzzleInfo),
    nextCursor: z.string().nullable().optional(),
});

export type PuzzleIndexResponse = z.infer<typeof PuzzleIndexResponse>;