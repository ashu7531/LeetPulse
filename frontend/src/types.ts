export type UserRole = 'TEACHER' | 'STUDENT';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  leetcode_username?: string;
  created_at: string;
}

export interface Batch {
  id: number;
  name: string;
  description: string;
  teacher_id: number;
  created_at: string;
  student_count?: number;
}

export interface Assignment {
  id: number;
  title: string;
  description: string;
  batch_id: number;
  deadline: string;
  created_at: string;
  problems?: AssignmentProblem[];
  total_problems?: number;
  completed_problems?: number;
}

export interface AssignmentProblem {
  id: number;
  assignment_id: number;
  problem_id: string; // e.g. "1"
  title_slug: string; // e.g. "two-sum"
  title: string;      // e.g. "Two Sum"
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface StudentProgress {
  problem_id: number;
  problem_title: string;
  problem_difficulty: 'Easy' | 'Medium' | 'Hard';
  title_slug: string;
  status: 'PENDING' | 'ON_TIME' | 'LATE';
  solved_at?: string;
}

export interface StudentAssignmentProgress {
  assignment_id: number;
  title: string;
  description?: string;
  deadline: string;
  problems: StudentProgress[];
}

export interface LeaderboardEntry {
  student_id: number;
  username: string;
  leetcode_username?: string;
  problems_solved_on_time: number;
  problems_solved_late: number;
  total_solved: number;
  rank: number;
}
