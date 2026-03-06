// Freelancer profile domain types
import type { SkillReference } from './skill.js';

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
  name: string | null;
  nationality: string | null;
  bio: string;
  hourlyRate: number;
  skills: SkillReference[];
  experience: WorkExperience[];
  availability: 'available' | 'busy' | 'unavailable';
  createdAt: string;
  updatedAt: string;
};

export { SkillReference };
