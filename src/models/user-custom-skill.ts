export type UserCustomSkill = {
  id: string;
  userId: string;
  name: string;
  description: string;
  yearsOfExperience: number;
  categoryName?: string | undefined;
  isApproved: boolean;
  suggestedForGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserCustomSkillInput = {
  name: string;
  description: string;
  yearsOfExperience: number;
  categoryName?: string | undefined;
  suggestForGlobal?: boolean;
};

export type UpdateUserCustomSkillInput = {
  name?: string;
  description?: string;
  yearsOfExperience?: number;
  categoryName?: string | undefined;
};

export type SkillSuggestion = {
  id: string;
  userId: string;
  skillName: string;
  skillDescription: string;
  categoryName?: string | undefined;
  suggestedBy: string; // user name
  timesRequested: number;
  // Anti-spam (BLF-skill.3): the distinct users who requested this suggestion.
  // timesRequested only increments when a NEW user requests it, so one account
  // cannot inflate popularity by deleting and re-creating the same skill.
  requesterIds: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
};