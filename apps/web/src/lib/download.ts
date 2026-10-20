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

/** For GET downloads: fetch with the session token, then save. */
export async function downloadWithAuth(path: string, token: string | null, fallbackName: string): Promise<boolean> {
  const res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) return false;
  await saveResponse(res, fallbackName);
  return true;
}
