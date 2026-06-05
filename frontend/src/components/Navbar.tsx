import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User as UserIcon, Terminal } from 'lucide-react';
import type { User } from '../types';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const userJson = localStorage.getItem('user');
  let user: User | null = null;

  if (userJson) {
    try {
      user = JSON.parse(userJson);
    } catch (_) {
      // Ignored
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="sticky top-0 z-50 w-full glass-card border-b border-white/5 px-6 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-2 rounded-lg text-white group-hover:scale-105 transition-transform">
            <Terminal size={20} />
          </div>
          <div>
            <span className="font-bold text-lg text-white tracking-wide">Leet<span className="text-indigo-400">Track</span></span>
            <span className="block text-[10px] text-gray-400 font-medium">Assignment Engine</span>
          </div>
        </Link>

        {/* User Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-full bg-slate-900/50 border border-white/5">
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <UserIcon size={16} />
            </div>
            <div className="text-left leading-none">
              <span className="block text-xs font-semibold text-white">{user.username}</span>
              <span className="text-[10px] text-indigo-300 font-medium tracking-wider uppercase">
                {user.role}
              </span>
            </div>
            {user.role === 'STUDENT' && user.leetcode_username && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-medium">
                {user.leetcode_username}
              </span>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 px-3.5 py-2 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all font-medium"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
