export interface AuthUser {
  sub: string; org: string; role: 'admin' | 'supervisor' | 'planner' | 'technician';
  name: string; plants: string[]; all: boolean; modules: number[];
}
