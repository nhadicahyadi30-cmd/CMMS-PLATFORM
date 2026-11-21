export interface AuthUser {
  sub: string; org: string; role: 'admin' | 'supervisor' | 'planner' | 'technician' | 'production';
  name: string; plants: string[]; all: boolean; modules: number[];
}
