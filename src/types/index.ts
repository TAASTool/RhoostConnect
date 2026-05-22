export type Role = 'Owner' | 'Admin' | 'Operator' | 'Viewer';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface ApiError {
  error: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
