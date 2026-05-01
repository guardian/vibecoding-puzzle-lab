import {z} from 'zod';
import { decodeJwt } from 'jose/jwt/decode';
import { IncomingHttpHeaders } from 'http';
import { UserInfoResponse } from '@puzzle-lab/common-lib';

// ---- IDP data, passed to us from the ALB as a header
export const JWTClaims = z.object({
    sub: z.string(),
    name: z.string(),
    email: z.string(),
    email_verified: z.string().optional(), //should be true or false but encapsulated in string
    identities: z.string().optional(),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
    picture: z.string().optional(),
    username: z.string().optional(),
    exp: z.number(),
    iss: z.string(),    //should be numeric but encapsulated in string
});

export function userIdentityFromHeaders(headers: IncomingHttpHeaders): UserInfoResponse {
    if(headers['x-amzn-oidc-data']) {
        //NOTE: we deliberately don't verify the JWT, that has already been done by the ALB.
        const decoded = decodeJwt(headers['x-amzn-oidc-data'] as string);
        const parsed = JWTClaims.parse(decoded);
        return {
            email: parsed.email,
            name: parsed.name,
            familyName: parsed.family_name,
            givenName: parsed.given_name,
            picture: parsed.picture,
            exp: parsed.exp,
        }
    } else {
        return {
            email: 'local-user@localhost',
            name: 'Local User',
            exp: Math.floor(Date.now() / 1000) + (60 * 60), //expire in 1 hour, just for testing
        }
    }
}