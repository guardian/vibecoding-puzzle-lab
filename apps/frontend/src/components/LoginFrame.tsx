import { useLoaderData } from "react-router";
import type { FrontendUserInfo } from "./UserInfoLoader";
import React, { useEffect } from "react";
import { ExclamationTriangleIcon, HomeIcon } from '@heroicons/react/24/solid'
import { Link } from "react-router";

interface LoginFrameProps {
    children: React.ReactNode;
    inserts?: React.ReactNode;
}

export const LoginFrame:React.FC<LoginFrameProps> = ({children, inserts}) => {
    const [expired, setExpired] = React.useState(false);
    const loginInfo = useLoaderData() as FrontendUserInfo | null;
    console.log(loginInfo);

    useEffect(() => {
        if(loginInfo?.isLoggedIn) {
            const expiresIn = loginInfo.info.exp * 1000 - Date.now();
            console.log(`Token expires in ${expiresIn}ms`);

            const timerId = window.setTimeout(()=> {
                setExpired(true);
            }, expiresIn);

            return () => {
                window.clearTimeout(timerId);
            }
        }
    }, [loginInfo]);

    return <>
        <div className="top-0 left-0 z-50 flex h-16 w-full items-center px-4 backdrop-blur bg-white/50 margin-4 shadow padding-4">
            <div>
                <Link to="/"><HomeIcon className="h-5 w-5 text-slate-700"/></Link>
            </div>
            {
                inserts ? <div className="ml-4">{inserts}</div> : null
            }
            <div className="ml-auto">
                {
                    loginInfo?.isLoggedIn ? (
                        expired ? <div className="flex items-center">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                            <span className="mr-3 ml-3 text-sm text-red-600">Session expired, refresh to continue</span>
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                        </div> : <div className="flex items-center">
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
        </div>
        {children}
    </>
}