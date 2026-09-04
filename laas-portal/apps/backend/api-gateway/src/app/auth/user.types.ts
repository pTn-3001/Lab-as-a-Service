export interface RequestUser {
  id: string;
  role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  email: string;
  username?: string;
}
