import { ApiError } from "./api";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

export async function downloadFile(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  if (API_KEY) headers.set("X-API-Key", API_KEY);

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body, `${res.status} ${res.statusText}: ${body}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
