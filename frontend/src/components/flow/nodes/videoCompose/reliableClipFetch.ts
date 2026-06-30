import { fetchClip } from "./fetchClip";

export async function reliableClipFetch(url: string, signal?: AbortSignal) {
  return fetchClip(url, {
    kind: "video",
    signal,
  });
}
