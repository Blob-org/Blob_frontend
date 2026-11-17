"use client";

import QRCode from "qrcode";
import { type FormEvent, useState } from "react";
import { useAuth } from "@/app/providers";
import { ApiError, api } from "@/lib/api";

type Phase =
    | { step: "idle" }
    // Scanning the QR code and confirming the first code.
    | { step: "setup"; secret: string; qr: string }
    // MFA is on; the recovery codes are shown this one time.
    | { step: "codes"; codes: string[] }
    | { step: "disable" };

// "JBSWY3DPEHPK3PXP" -> "JBSW Y3DP EHPK 3PXP", easier to type by hand.
const groupInFours = (secret: string) =>
    secret.match(/.{1,4}/g)?.join(" ") ?? secret;

// Turns two-factor authentication (TOTP) on and off.
export function MfaPanel() {
    const auth = useAuth();
    const [phase, setPhase] = useState<Phase>({ step: "idle" });
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    if (auth.state.status !== "signedIn") return null;
    const enabled = auth.state.user.mfaEnabled;

    function reset(next: Phase) {
        setPhase(next);
        setCode("");
        setPassword("");
        setError(null);
        setCopied(false);
    }

    function report(caught: unknown) {
        if (caught instanceof ApiError && caught.status === 401) {
            if (!api.isSignedIn) {
                auth.sessionExpired();
                return;
            }
            setError(
                caught.message === "Wrong password"
                    ? "That password is wrong."
                    : "That code is wrong. Enter the current code from your app.",
            );
            setCode("");
            return;
        }
        if (caught instanceof ApiError && caught.status === 429) {
            setError("Too many attempts. Wait a minute and try again.");
            return;
        }
        setError(
            caught instanceof ApiError
                ? caught.message
                : "Something went wrong.",
        );
    }

    async function run(task: () => Promise<void>) {
        setBusy(true);
        setError(null);
        try {
            await task();
        } catch (caught) {
            report(caught);
        } finally {
            setBusy(false);
        }
    }

    const start = () =>
        run(async () => {
            const { secret, otpauthUrl } = await api.mfaSetup();
            const qr = await QRCode.toDataURL(otpauthUrl, {
                margin: 1,
                width: 200,
            });
            reset({ step: "setup", secret, qr });
        });

    const confirm = (event: FormEvent) => {
        event.preventDefault();
        return run(async () => {
            reset({ step: "codes", codes: await api.mfaEnable(code) });
        });
    };

    const turnOff = (event: FormEvent) => {
        event.preventDefault();
        return run(async () => {
            await api.mfaDisable(password, code);
            await auth.reloadUser();
            reset({ step: "idle" });
        });
    };

    // Only after the user has saved the codes: reloading the user switches
    // this panel to "on" and the codes are gone for good.
    const done = () =>
        run(async () => {
            await auth.reloadUser();
            reset({ step: "idle" });
        });

    function download(codes: string[]) {
        const text = [
            "Blob storage recovery codes",
            "Each code works once, in place of a code from your app.",
            "",
            ...codes,
            "",
        ].join("\n");
        const url = URL.createObjectURL(
            new Blob([text], { type: "text/plain" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "blob-storage-recovery-codes.txt";
        link.click();
        URL.revokeObjectURL(url);
    }

    async function copy(codes: string[]) {
        await navigator.clipboard.writeText(codes.join("\n"));
        setCopied(true);
    }

    const errorLine = error && (
        <p className="error" role="alert">
            {error}
        </p>
    );

    return (
        <section className="card mfa-panel">
            <h2>Two-factor authentication</h2>

            {phase.step === "idle" && (
                <>
                    <p className="muted">
                        {enabled
                            ? "On. Signing in needs your password and a code from your authenticator app."
                            : "Off. Turn it on so a stolen password alone isn't enough to sign in."}
                    </p>
                    {errorLine}
                    {enabled ? (
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => reset({ step: "disable" })}
                        >
                            Turn off…
                        </button>
                    ) : (
                        <button type="button" disabled={busy} onClick={start}>
                            {busy ? "Preparing…" : "Turn on"}
                        </button>
                    )}
                </>
            )}

            {phase.step === "setup" && (
                <form onSubmit={confirm}>
                    <ol className="steps">
                        <li>
                            Scan this QR code with an authenticator app (Google
                            Authenticator, 1Password, Authy, …).
                            <img
                                className="qr"
                                src={phase.qr}
                                alt="QR code for your authenticator app"
                                width={200}
                                height={200}
                            />
                            <span className="muted">
                                Can&apos;t scan it? Enter this key instead:
                            </span>
                            <code className="secret">
                                {groupInFours(phase.secret)}
                            </code>
                        </li>
                        <li>
                            <label>
                                Enter the 6-digit code it shows
                                <input
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9 ]{6,7}"
                                    maxLength={7}
                                    placeholder="123456"
                                    required
                                    value={code}
                                    onChange={(event) =>
                                        setCode(event.target.value)
                                    }
                                />
                            </label>
                        </li>
                    </ol>
                    {errorLine}
                    <div className="toolbar end">
                        <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => reset({ step: "idle" })}
                        >
                            Cancel
                        </button>
                        <button type="submit" disabled={busy || code === ""}>
                            {busy ? "Checking…" : "Turn on"}
                        </button>
                    </div>
                </form>
            )}

            {phase.step === "codes" && (
                <>
                    <p>
                        <strong>Two-factor authentication is on.</strong> Save
                        these recovery codes somewhere safe. If you lose your
                        phone, each one signs you in once. They won&apos;t be
                        shown again.
                    </p>
                    <ul className="recovery-codes">
                        {phase.codes.map((recoveryCode) => (
                            <li key={recoveryCode}>
                                <code>{recoveryCode}</code>
                            </li>
                        ))}
                    </ul>
                    {errorLine}
                    <div className="toolbar end">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => download(phase.codes)}
                        >
                            Download .txt
                        </button>
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => copy(phase.codes)}
                        >
                            {copied ? "Copied" : "Copy"}
                        </button>
                        <button type="button" disabled={busy} onClick={done}>
                            I&apos;ve saved them
                        </button>
                    </div>
                </>
            )}

            {phase.step === "disable" && (
                <form onSubmit={turnOff}>
                    <p className="muted">
                        Confirm with your password and a code from your app (or
                        a recovery code).
                    </p>
                    <label>
                        Password
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
                    <label>
                        Code
                        <input
                            autoComplete="one-time-code"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="123456"
                            required
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                        />
                    </label>
                    {errorLine}
                    <div className="toolbar end">
                        <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => reset({ step: "idle" })}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="danger"
                            disabled={busy || password === "" || code === ""}
                        >
                            {busy ? "Turning off…" : "Turn off"}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}
