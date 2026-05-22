export type Role = 'super_admin' | 'Owner' | 'Admin' | 'Operator' | 'Viewer';
export type Visibility = 'tenant' | 'private';

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
