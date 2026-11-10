export type Source = { label: string; url: string; verifiedAt?: string };
export type FieldValue = { value: string | null; sources?: Source[]; showSources?: boolean };
export type Visual = {
  id: string; title: string; category: '2D' | '3D'; kind: string; date: string | null;
  imageUrl?: string | null; revealUrl?: string | null;
  variants: { id: string; name: string; date: string | null; imageUrl?: string | null }[];
};
export type Music = {
  id: string; title: string; category: 'original' | 'cover' | 'participation';
  date: string | null; participantIds: string[]; youtubeUrl?: string | null; thumbnailUrl?: string | null;
};
export type Event = { id: string; title: string; date: string | null; category: 'milestone' | 'event' | 'other'; description?: string };
export type Video = {
  id: string; title: string; status: 'live' | 'upcoming' | 'archive' | 'video' | 'short';
  publishedAt: string | null; scheduledStartAt?: string | null; url?: string | null;
  thumbnailUrl?: string | null;
};
export type Liver = {
  id: string; status: 'active' | 'graduated'; name: string; reading: string | null; englishName: string | null;
  affiliation: string; group: string | null; branch: string; officialProfileUrl: string;
  portraitUrl?: string | null; youtubeChannelUrl?: string | null; youtubeChannelId?: string | null;
  xUrl?: string | null; birthday: FieldValue; debutDate: FieldValue; height: FieldValue;
  fanMark: FieldValue; introduction: FieldValue;
  fields: { section: string; items: { label: string; data: FieldValue }[] }[];
  changes: { id: string; field: string; oldValue: string | null; newValue: string | null; changedAt: string }[];
  visuals: Visual[]; music: Music[]; events: Event[];
  youtube: { fetchedAt: string | null; stateCheckedAt: string | null; videos: Video[] };
};
export type LiverIndex = { generatedAt: string | null; demo: boolean; livers: Liver[] };
