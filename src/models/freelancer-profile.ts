export type SkillReference = {
  skillId: string;
  skillName: string;
  categoryId: string;
  yearsOfExperience: number;
};

export type WorkExperience = {
  id: string;
  title: string;
  company: string;
  description: string;
  startDate: string;
  endDate: string | null;
};

export type FreelancerProfile = {
  id: string;
  userId: string;
  bio: string;
  hourlyRate: number;
  skills: SkillReference[];
  experience: WorkExperience[];
  availability: 'available' | 'busy' | 'unavailable';
  createdAt: string;
  updatedAt: string;
};
