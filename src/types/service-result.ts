export type ServiceError = {
  code: string;
  message: string;
  details?: string[];
  retryAfter?: string;
};

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };