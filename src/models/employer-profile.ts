// Employer profile domain types
export type EmployerProfile = {
  id: string;
  userId: string;
  name: string | null;
  nationality: string | null;
  companyName: string;
  description: string;
  industry: string;
  createdAt: string;
  updatedAt: string;
};
