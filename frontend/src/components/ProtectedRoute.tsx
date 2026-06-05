import React from 'react';
import { Navigate } from 'react-router-dom';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const userJson = localStorage.getItem('user');
  
  if (!token || !userJson) {
    return <Navigate to="/login" replace />;
  }

  try {
    const user = JSON.parse(userJson);
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      // Redirect to their default dashboard if role not permitted
      const targetPath = user.role === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard';
      return <Navigate to={targetPath} replace />;
    }
  } catch (err) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
