export type AppRole = 'admin' | 'responsable' | 'benevole';

export type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  role: AppRole;
  sector: string | null;
  created_at: string;
};

export type Mission = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  sector: string | null;
  starts_at: string;
  ends_at: string;
  required_volunteers: number;
  status: 'draft' | 'proposed' | 'closed' | 'confirmed' | 'cancelled';
  created_by: string;
  created_at: string;
};

export type MissionProposalResponse = 'no_response' | 'available' | 'unavailable' | 'maybe';

export type MissionProposal = {
  id: string;
  mission_id: string;
  volunteer_id: string;
  proposed_by: string;
  response: MissionProposalResponse;
  responded_at: string | null;
  created_at: string;
};
