import { useLoaderData } from "react-router";
import type { FrontendUserInfo } from "./UserInfoLoader";

interface LoginFrameProps {
    children: React.ReactNode;
}

export const LoginFrame:React.FC<LoginFrameProps> = ({children}) => {
    const loginInfo = useLoaderData() as FrontendUserInfo | null;
    console.log(loginInfo);

    return <>
        <div className="top-0 left-0 z-50 flex h-16 w-full items-center justify-end pr-4 backdrop-blur bg-white/50 margin-4 shadow padding-4">
            {
                loginInfo?.isLoggedIn ? (
                    <div className="flex items-center">
                        <span className="mr-3 text-sm text-slate-700">{loginInfo.info.name ?? loginInfo.info.email}</span>
                        {
                            loginInfo.info.picture ? (
                                <img src={loginInfo.info.picture} alt="Profile" className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                                <div className="h-8 w-8 rounded-full bg-slate-300 flex items-center justify-center">
                                    <span className="text-sm text-slate-700">{loginInfo.info.email.charAt(0).toUpperCase()}</span>
                                </div>
                            )
                        }
                    </div>
                ) : (
                    <a href="/api/login" className="text-sm text-slate-700 hover:text-slate-900">You are not logged in</a>
                )
            }
        </div>
        {children}
    </>
}