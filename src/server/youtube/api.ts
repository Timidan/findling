const API = "https://www.googleapis.com/youtube/v3";

interface ChannelListResponse {
  items?: Array<{
    id: string;
    snippet?: { title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface PlaylistItemsResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
  }>;
}

interface VideoListResponse {
  items?: Array<{ id: string; snippet?: { channelId?: string } }>;
}

export interface MyChannel {
  channelId: string;
  title: string;
  uploadsPlaylistId: string;
}

export async function getMyChannel(accessToken: string): Promise<MyChannel> {
  const res = await fetch(`${API}/channels?part=snippet,contentDetails&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`channels.list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as ChannelListResponse;
  const item = data.items?.[0];
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!item || !uploads) {
    throw new Error("No YouTube channel found for this account.");
  }
  return { channelId: item.id, title: item.snippet?.title ?? "", uploadsPlaylistId: uploads };
}

export interface MyVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
}

export async function listUploads(
  accessToken: string,
  uploadsPlaylistId: string,
  maxResults = 25,
): Promise<MyVideo[]> {
  const res = await fetch(
    `${API}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`playlistItems.list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as PlaylistItemsResponse;
  return (data.items ?? [])
    .map((it): MyVideo => ({
      videoId: it.contentDetails?.videoId ?? "",
      title: it.snippet?.title ?? "",
      thumbnailUrl:
        it.snippet?.thumbnails?.medium?.url ??
        it.snippet?.thumbnails?.default?.url ??
        null,
      publishedAt: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? "",
    }))
    .filter((v) => v.videoId);
}

/** Confirm a video is owned by the given channel (ownership re-check before import). */
export async function getVideoChannelId(
  accessToken: string,
  videoId: string,
): Promise<string | null> {
  const res = await fetch(`${API}/videos?part=snippet&id=${videoId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`videos.list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as VideoListResponse;
  return data.items?.[0]?.snippet?.channelId ?? null;
}
