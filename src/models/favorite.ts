export type Favorite = {
  id: string;
  userId: string;
  targetType: 'project' | 'freelancer';
  targetId: string;
  createdAt: string;
};

export type FavoriteEntity = {
  id: string;
  user_id: string;
  target_type: 'project' | 'freelancer';
  target_id: string;
  created_at: string;
};
