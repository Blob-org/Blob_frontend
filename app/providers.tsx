"use client";

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { api, type User } from "@/lib/api";

type AuthState =
    | { status: "loading" }
    | { status: "signedOut" }
    | { status: "signedIn"; user: User };

type AuthContextValue = {
    state: AuthState;
    // Signs in, or returns the mfaToken when a code is needed next.
    login(email: string, password: string): Promise<{ mfaToken?: string }>;
    // The code step of a login with MFA. ApiError.restart means start over.
    completeMfa(mfaToken: string, code: string): Promise<void>;
    register(email: string, password: string): Promise<void>;
    logout(): Promise<void>;
    // Deletes the account and all files; throws ApiError (e.g. wrong
    // password) and stays signed in if it fails.
    deleteAccount(password: string, code?: string): Promise<void>;
    // Re-reads the user, e.g. after MFA was turned on or off.
    reloadUser(): Promise<void>;
    // Called when a request finds the session gone (refresh failed).
    sessionExpired(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ status: "loading" });

    // A reload loses the in-memory token, but the refresh cookie survives,
    // so try to swap it for a new token before deciding the user is out.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const user = (await api.refresh()) ? await api.me() : null;
            if (!cancelled) {
                setState(
                    user
                        ? { status: "signedIn", user }
                        : { status: "signedOut" },
                );
            }
        })().catch(() => {
            if (!cancelled) setState({ status: "signedOut" });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const result = await api.login(email, password);
        if (result.mfaRequired) return { mfaToken: result.mfaToken };
        setState({ status: "signedIn", user: await api.me() });
        return {};
    }, []);

    const completeMfa = useCallback(async (mfaToken: string, code: string) => {
        await api.loginMfa(mfaToken, code);
        setState({ status: "signedIn", user: await api.me() });
    }, []);

    const reloadUser = useCallback(async () => {
        setState({ status: "signedIn", user: await api.me() });
    }, []);

    const register = useCallback(
        async (email: string, password: string) => {
            await api.register(email, password);
            await login(email, password);
        },
        [login],
    );

    const logout = useCallback(async () => {
        await api.logout().catch(() => {});
        setState({ status: "signedOut" });
    }, []);

    const deleteAccount = useCallback(
        async (password: string, code?: string) => {
            await api.deleteAccount(password, code);
            setState({ status: "signedOut" });
        },
        [],
    );

    const sessionExpired = useCallback(() => {
        setState({ status: "signedOut" });
    }, []);

    const value = useMemo(
        () => ({
            state,
            login,
            completeMfa,
            register,
            logout,
            deleteAccount,
            reloadUser,
            sessionExpired,
        }),
        [
            state,
            login,
            completeMfa,
            register,
            logout,
            deleteAccount,
            reloadUser,
            sessionExpired,
        ],
    );
    return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used inside AuthProvider");
    return context;
}
