import { UserInfoResponse } from "@puzzle-lab/common-lib";

export type FrontendUserInfo = {
    isLoggedIn: false
} | {
    isLoggedIn: true,
    info: UserInfoResponse
}

export async function UserInfoLoader() {
    const response = await fetch('/api/whoami');
    if(response.status!=200) {
        const statusText = await response.text();
        console.error(`Could not get userinfo: ${response.status} ${statusText}`);
        return {
            isLoggedIn: false,
        }
    } else {
        const content = UserInfoResponse.safeParse(await response.json());
        if(content.success) {
            return {
                isLoggedIn: true,
                info: content.data,
            }
        } else {
            console.error(`Could not decode server response: ${content.error}`);
            return {
                isLoggedIn: false
            }
        }
    }
}