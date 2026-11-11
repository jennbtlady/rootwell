"use client";

/** Saves a fetch response (PDF or CSV) as a file. API calls carry a bearer token, so a plain link cannot. */
export async function saveResponse(res: Response, fallbackName: string): Promise<void> {
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * For GET downloads: fetch with the session token, then save.
 * When the server refuses (403), `reason` is its own sentence, such as the need for
 * two-step sign-in, so the button can say why instead of "try again".
 */
export async function downloadWithAuth(
  path: string,
  token: string | null,
  fallbackName: string,
): Promise<{ ok: true } | { ok: false; reason: string | null }> {
  const res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) return { ok: false, reason: res.status === 403 ? await refusal(res) : null };
  await saveResponse(res, fallbackName);
  return { ok: true };
}

async function refusal(res: Response): Promise<string | null> {
  try {
    return ((await res.json()) as { error?: string }).error ?? null;
  } catch {
    return null;
  }
}
