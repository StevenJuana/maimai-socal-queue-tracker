export type LocationStatus = {
  id: string; name: string; city: string; created_at: string;
  latest_update: { playing_count: number; queue_count: number; created_at: string; display_name: string } | null;
};
