/**
 * Lidify predeploy smoke tests (API-level).
 *
 * Goals:
 * - deterministic, fast "is the app basically working?" checks
 * - no build step (runs via tsx)
 *
 * Usage:
 *   LIDIFY_API_BASE_URL=http://127.0.0.1:3006 \
 *   LIDIFY_TEST_USERNAME=predeploy \
 *   LIDIFY_TEST_PASSWORD=predeploy-password \
 *   npm run test:smoke
 */

type Json = any;

const API_BASE_URL = (process.env.LIDIFY_API_BASE_URL || "http://127.0.0.1:3006").replace(/\/$/, "");
const USERNAME = process.env.LIDIFY_TEST_USERNAME || "predeploy";
const PASSWORD = process.env.LIDIFY_TEST_PASSWORD || "predeploy-password";

const WAIT_MS = Number(process.env.LIDIFY_SMOKE_WAIT_MS || "60000"); // total budget
const POLL_INTERVAL_MS = Number(process.env.LIDIFY_SMOKE_POLL_INTERVAL_MS || "1000");

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function assert(condition: any, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function fetchJson(
    path: string,
    opts: RequestInit & { token?: string } = {}
): Promise<{ status: number; ok: boolean; json: Json }> {
    const url = `${API_BASE_URL}${path}`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(opts.headers as any),
    };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

    const res = await fetch(url, { ...opts, headers });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, json };
}

async function waitForHealth() {
    const start = Date.now();
    let lastErr: any = null;

    while (Date.now() - start < WAIT_MS) {
        try {
            const res = await fetch(`${API_BASE_URL}/health`);
            if (res.ok) return;
            lastErr = new Error(`health returned ${res.status}`);
        } catch (e) {
            lastErr = e;
        }
        await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
        `Backend did not become healthy at ${API_BASE_URL}/health within ${WAIT_MS}ms. Last error: ${
            lastErr instanceof Error ? lastErr.message : String(lastErr)
        }`
    );
}

async function ensureTestUserAndToken(): Promise<string> {
    // Prefer onboarding/register because it's available without admin and works even when users exist.
    const register = await fetchJson("/api/onboarding/register", {
        method: "POST",
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });

    if (register.ok && register.json?.token) {
        return register.json.token as string;
    }

    // If user already exists, login.
    const login = await fetchJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    assert(login.ok, `Login failed: status=${login.status} body=${JSON.stringify(login.json)}`);
    assert(login.json?.token, `Login did not return token: ${JSON.stringify(login.json)}`);
    return login.json.token as string;
}

async function completeOnboarding(token: string) {
    const res = await fetchJson("/api/onboarding/complete", {
        method: "POST",
        token,
    });
    // It's fine if it's already complete; endpoint should still succeed.
    assert(res.ok, `Onboarding complete failed: status=${res.status} body=${JSON.stringify(res.json)}`);
}

async function getOneTrackId(token: string): Promise<string | null> {
    const tracks = await fetchJson("/api/library/tracks?limit=1&offset=0", { method: "GET", token });
    assert(tracks.ok, `Fetch tracks failed: status=${tracks.status} body=${JSON.stringify(tracks.json)}`);
    const id = tracks.json?.tracks?.[0]?.id;
    return typeof id === "string" ? id : null;
}

async function scanLibraryIfNeeded(token: string) {
    // If you already have at least one track, don’t force a scan (keeps it fast).
    const existing = await getOneTrackId(token);
    if (existing) return;

    const scan = await fetchJson("/api/library/scan", { method: "POST", token });
    assert(scan.ok, `Library scan start failed: status=${scan.status} body=${JSON.stringify(scan.json)}`);
    const jobId = scan.json?.jobId;
    assert(typeof jobId === "string", `Library scan did not return jobId: ${JSON.stringify(scan.json)}`);

    const start = Date.now();
    while (Date.now() - start < WAIT_MS) {
        const status = await fetchJson(`/api/library/scan/status/${jobId}`, { method: "GET", token });
        assert(status.ok, `Library scan status failed: status=${status.status} body=${JSON.stringify(status.json)}`);
        const s = status.json?.status;
        if (s === "completed" || s === "complete" || s === "done" || s === "success") return;
        if (s === "failed" || s === "error") {
            throw new Error(`Library scan failed: ${JSON.stringify(status.json)}`);
        }
        await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`Library scan did not complete within ${WAIT_MS}ms (jobId=${jobId}).`);
}

async function playlistsCrud(token: string) {
    // Needs at least one track.
    const trackId = await getOneTrackId(token);
    assert(
        trackId,
        `No tracks found. Set MUSIC_PATH to a library with at least one track, or run a scan before testing.`
    );

    const created = await fetchJson("/api/playlists", {
        method: "POST",
        token,
        body: JSON.stringify({ name: `predeploy-smoke-${Date.now()}`, isPublic: false }),
    });
    assert(created.ok, `Create playlist failed: status=${created.status} body=${JSON.stringify(created.json)}`);
    const playlistId = created.json?.id;
    assert(typeof playlistId === "string", `Create playlist missing id: ${JSON.stringify(created.json)}`);

    const add = await fetchJson(`/api/playlists/${playlistId}/items`, {
        method: "POST",
        token,
        body: JSON.stringify({ trackId }),
    });
    assert(add.ok, `Add track to playlist failed: status=${add.status} body=${JSON.stringify(add.json)}`);

    const del = await fetchJson(`/api/playlists/${playlistId}`, { method: "DELETE", token });
    assert(del.ok, `Delete playlist failed: status=${del.status} body=${JSON.stringify(del.json)}`);
}

async function playbackStateRoundTrip(token: string) {
    const trackId = await getOneTrackId(token);
    assert(
        trackId,
        `No tracks found. Set MUSIC_PATH to a library with at least one track, or run a scan before testing.`
    );

    const payload = {
        playbackType: "track",
        trackId,
        queue: [{ id: trackId }],
        currentIndex: 0,
        isShuffle: false,
    };

    const save = await fetchJson("/api/playback-state", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
    });
    assert(save.ok, `Save playback state failed: status=${save.status} body=${JSON.stringify(save.json)}`);

    const got = await fetchJson("/api/playback-state", { method: "GET", token });
    assert(got.ok, `Get playback state failed: status=${got.status} body=${JSON.stringify(got.json)}`);
}

async function main() {
    const started = Date.now();
    console.log(`[smoke] API_BASE_URL=${API_BASE_URL}`);

    await waitForHealth();
    console.log("[smoke] health ok");

    const token = await ensureTestUserAndToken();
    console.log(`[smoke] got token for user=${USERNAME}`);

    await completeOnboarding(token);
    console.log("[smoke] onboarding marked complete");

    await scanLibraryIfNeeded(token);
    console.log("[smoke] library ready");

    await playlistsCrud(token);
    console.log("[smoke] playlists CRUD ok");

    await playbackStateRoundTrip(token);
    console.log("[smoke] playback-state roundtrip ok");

    console.log(`[smoke] PASS in ${Date.now() - started}ms`);
}

main().catch((err) => {
    console.error("[smoke] FAIL", err);
    process.exit(1);
});


