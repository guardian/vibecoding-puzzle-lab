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

// Must match the sessionTimeoutInMinutes configured on the ALB AuthenticateCognitoAction
// in the CDK (CognitoGatekeeper). The ALB session cookie controls the true session lifetime;
// we cannot read its expiry directly, but we can approximate it here.
//
// Crucially, the `exp` field in the x-amzn-oidc-data JWT is NOT the session expiry — the
// ALB reissues that JWT on every request, so its `exp` is only ~60 seconds in the future.
// Using parsed.exp directly would cause the frontend to show a false "session expired"
// warning after ~60 seconds. Instead, we compute a rolling expiry of now + sessionTimeout,
// which is safe to do precisely because the JWT is reissued on every request: the frontend
// receives a fresh `exp` on each navigation, so the countdown always reflects the correct
// remaining session window.
//
// The value is injected via the ALB_SESSION_TIMEOUT_MINUTES environment variable, which is
// set by the CDK from the same CognitoGatekeeper.sessionTimeoutInMinutes property that
// configures the ALB, ensuring they always stay in sync.
export function userIdentityFromHeaders(headers: IncomingHttpHeaders, sessionTimeoutInMinutes: number): UserInfoResponse {
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
            exp: Math.floor(Date.now() / 1000) + (sessionTimeoutInMinutes * 60),
        }
    } else {
        return {
            email: 'local-user@localhost',
            name: 'Local User',
            exp: Math.floor(Date.now() / 1000) + (60 * 60), //expire in 1 hour, just for testing
        }
    }
}