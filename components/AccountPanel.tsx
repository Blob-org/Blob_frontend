"use client";

import { type FormEvent, useState } from "react";
import { useAuth } from "@/app/providers";
import { ApiError, api } from "@/lib/api";

// Lets the user erase their account and every file (GDPR right to erasure).
// Asks for the password again, and a code when MFA is on; auth_service
// checks both.
export function AccountPanel() {
    const { deleteAccount, sessionExpired, state } = useAuth();
    const mfaEnabled = state.status === "signedIn" && state.user.mfaEnabled;
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setBusy(true);
        try {
            // On success the provider signs out and the page leaves.
            await deleteAccount(password, mfaEnabled ? code : undefined);
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 401) {
                if (!api.isSignedIn) {
                    sessionExpired();
                    return;
                }
                setError(
                    caught.message === "Invalid code"
                        ? "That code is wrong. Enter the current code from your app."
                        : "That password is wrong.",
                );
                setCode("");
            } else if (caught instanceof ApiError && caught.status === 502) {
                setError(
                    "Your files couldn't be erased right now, so nothing was deleted. Try again shortly.",
                );
            } else {
                setError(
                    caught instanceof ApiError
                        ? caught.message
                        : "Couldn't delete your account.",
                );
            }
            setBusy(false);
        }
    }

    return (
        <section className="card danger-zone">
            <h2>Delete account</h2>
            <p className="muted">
                Permanently deletes your account and every file you uploaded.
                This can&apos;t be undone.
            </p>
            {!open ? (
                <button
                    type="button"
                    className="secondary danger"
                    onClick={() => setOpen(true)}
                >
                    Delete my account…
                </button>
            ) : (
                <form onSubmit={onSubmit}>
                    <label>
                        Confirm with your password
                        <input
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                        />
                    </label>
                    {mfaEnabled && (
                        <label>
                            Code from your authenticator app (or a recovery
                            code)
                            <input
                                autoComplete="one-time-code"
                                autoCapitalize="none"
                                spellCheck={false}
                                placeholder="123456"
                                required
                                value={code}
                                onChange={(event) =>
                                    setCode(event.target.value)
                                }
                            />
                        </label>
                    )}
                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}
                    <div className="toolbar">
                        <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                                setOpen(false);
                                setPassword("");
                                setCode("");
                                setError(null);
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="danger"
                            disabled={
                                busy ||
                                password === "" ||
                                (mfaEnabled && code === "")
                            }
                        >
                            {busy ? "Deleting…" : "Delete my account and files"}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}
