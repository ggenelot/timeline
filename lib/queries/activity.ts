import { supabase } from '@/lib/supabase/client';
import type { ActivityAct } from '@/lib/types';

type RawRow = {
  profile_id: string;
  profile_name: string | null;
  type_name: string;
  mission_id: string;
  mission_title: string;
  mission_date: string;
  hours: number;
};

export async function getCandidateActivity(missionId: string): Promise<ActivityAct[]> {
  const { data, error } = await supabase.rpc('get_candidate_activity', {
    p_mission_id: missionId,
  });
  if (error) throw error;
  return ((data ?? []) as RawRow[]).map((row) => ({
    profileId: row.profile_id,
    profileName: row.profile_name ?? 'Bénévole',
    typeName: row.type_name,
    missionId: row.mission_id,
    missionTitle: row.mission_title,
    missionDate: row.mission_date,
    hours: Number(row.hours),
  }));
}
