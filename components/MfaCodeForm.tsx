"use client";

import { type FormEvent, useState } from "react";
import { useAuth } from "@/app/providers";
import { ApiError } from "@/lib/api";

// The second login step for users with MFA on: a code from the authenticator
// app, or one of the recovery codes.
export function MfaCodeForm({
    mfaToken,
    onRestart,
}: {
    mfaToken: string;
    // Back to the password step, with a message to show there.
    onRestart(message: string | null): void;
}) {
    const { completeMfa } = useAuth();
    const [recovery, setRecovery] = useState(false);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            // On success the provider signs in and the page moves on.
            await completeMfa(mfaToken, code);
        } catch (caught) {
            setBusy(false);
            if (caught instanceof ApiError && caught.restart) {
                onRestart("Your sign-in expired. Enter your password again.");
            } else if (caught instanceof ApiError && caught.status === 401) {
                setError(
                    recovery
                        ? "That recovery code is wrong or was already used."
                        : "That code is wrong. Enter the current code from your app.",
                );
                setCode("");
            } else if (caught instanceof ApiError && caught.status === 429) {
                setError("Too many attempts. Wait a minute and try again.");
            } else {
                setError(
                    caught instanceof ApiError
                        ? caught.message
                        : "Can't reach the server. Is api_gateway running?",
                );
            }
        }
    }

    return (
        <form className="card auth-card" onSubmit={onSubmit}>
            <h1>Two-factor authentication</h1>
            <p className="muted">
                {recovery
                    ? "Enter one of the recovery codes you saved when you turned on two-factor authentication. Each code works once."
                    : "Enter the 6-digit code from your authenticator app."}
            </p>
            {recovery ? (
                <label key="recovery">
                    Recovery code
                    <input
                        name="code"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="abcde-fghij"
                        required
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                    />
                </label>
            ) : (
                <label key="totp">
                    Code
                    <input
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9 ]{6,7}"
                        maxLength={7}
                        placeholder="123456"
                        required
                        // biome-ignore lint/a11y/noAutofocus: the only field on a step the user just arrived at
                        autoFocus
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                    />
                </label>
            )}
            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}
            <button type="submit" disabled={busy || code.trim() === ""}>
                {busy ? "Checking…" : "Verify"}
            </button>
            <div className="auth-links">
                <button
                    type="button"
                    className="link"
                    onClick={() => {
                        setRecovery(!recovery);
                        setCode("");
                        setError(null);
                    }}
                >
                    {recovery
                        ? "Use a code from your app"
                        : "Use a recovery code"}
                </button>
                <button
                    type="button"
                    className="link"
                    onClick={() => onRestart(null)}
                >
                    Back to sign in
                </button>
            </div>
        </form>
    );
}
