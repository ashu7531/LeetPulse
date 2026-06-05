import React, { useState, useEffect } from 'react';
import { 
  Award, BookOpen, CheckCircle, Clock, AlertCircle, 
  ExternalLink, RefreshCw, Link as LinkIcon
} from 'lucide-react';
import api from '../api';
import Navbar from '../components/Navbar';
import type { StudentAssignmentProgress, LeaderboardEntry, User } from '../types';

const StudentDashboard: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignmentProgress[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<StudentAssignmentProgress | null>(null);
  
  const [leetcodeUsername, setLeetcodeUsername] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const userJson = localStorage.getItem('user');
    if (userJson) {
      const parsed = JSON.parse(userJson);
      setCurrentUser(parsed);
      setLeetcodeUsername(parsed.leetcode_username || '');
    }
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setDataLoading(true);
    try {
      const [assignmentsRes, leaderboardRes, meRes] = await Promise.all([
        api.get('/student/assignments'),
        api.get('/student/leaderboard'),
        api.get('/auth/me'),
      ]);
      setAssignments(assignmentsRes.data);
      setLeaderboard(leaderboardRes.data);
      setCurrentUser(meRes.data);
      localStorage.setItem('user', JSON.stringify(meRes.data));
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const handleLinkLeetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkLoading(true);
    setMessage(null);
    try {
      await api.post('/student/link-leetcode', { leetcode_username: leetcodeUsername });
      const updatedUser = { ...currentUser!, leetcode_username: leetcodeUsername };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      setMessage({ text: 'LeetCode profile linked successfully!', type: 'success' });
      fetchDashboardData();
    } catch (err: any) {
      setMessage({ 
        text: err.response?.data?.message || 'Failed to link profile.', 
        type: 'error' 
      });
    } finally {
      setLinkLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncLoading(true);
    setMessage(null);
    try {
      const res = await api.post('/student/sync-progress');
      setMessage({ 
        text: `Progress synced! ${res.data.synced_count} new solves updated.`, 
        type: 'success' 
      });
      fetchDashboardData();
    } catch (err: any) {
      setMessage({ 
        text: err.response?.data?.message || 'Failed to sync progress.', 
        type: 'error' 
      });
    } finally {
      setSyncLoading(false);
    }
  };



  const openAssignmentDetails = async (assignment: StudentAssignmentProgress) => {
    try {
      const detailedRes = await api.get(`/student/assignments/${assignment.assignment_id}`);
      setSelectedAssignment(detailedRes.data);
    } catch (err) {
      setSelectedAssignment(assignment);
    }
  };

  // Metrics computation
  const totalAssignments = assignments.length;
  let completedProblemsCount = 0;
  let totalProblemsCount = 0;
  let onTimeProblemsCount = 0;
  let lateProblemsCount = 0;
  let pendingProblemsCount = 0;

  assignments.forEach((assign) => {
    assign.problems.forEach((prob) => {
      totalProblemsCount++;
      if (prob.status === 'ON_TIME') {
        completedProblemsCount++;
        onTimeProblemsCount++;
      } else if (prob.status === 'LATE') {
        completedProblemsCount++;
        lateProblemsCount++;
      } else {
        pendingProblemsCount++;
      }
    });
  });

  return (
    <div className="min-h-screen bg-[#0b0f19]">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Status Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl border text-sm flex items-center justify-between ${
            message.type === 'success' 
              ? 'bg-green-500/10 border-green-500/20 text-green-400' 
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            <span>{message.text}</span>
            <button 
              onClick={() => setMessage(null)} 
              className="text-xs font-semibold underline hover:no-underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top Section: LeetCode profile linking */}
        <div className="glass-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 m-0">
              <LinkIcon className="text-indigo-400" size={20} />
              LeetCode Integration
            </h2>
            <p className="text-sm text-gray-400 max-w-2xl">
              Link your username. The platform automatically syncs your progress (checks on load maximum once every 15 minutes).
            </p>
            {currentUser?.leetcode_username && (
              <div className="text-xs text-indigo-400 font-semibold flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                {currentUser.last_synced_at ? (
                  <span>Last auto-synced: {new Date(currentUser.last_synced_at).toLocaleString()}</span>
                ) : (
                  <span>First sync in progress... refresh in a few seconds!</span>
                )}
              </div>
            )}
          </div>
          
          {currentUser?.leetcode_username ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div className="flex items-center justify-between gap-6 bg-indigo-500/10 border border-indigo-500/20 px-5 py-3.5 rounded-xl">
                <div>
                  <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">Connected Profile</span>
                  <span className="text-sm text-white font-bold">{currentUser.leetcode_username}</span>
                </div>
                <button
                  onClick={() => {
                    // Temporarily clear to show form
                    setCurrentUser({ ...currentUser, leetcode_username: undefined });
                    setLeetcodeUsername('');
                  }}
                  className="text-xs font-semibold text-gray-400 hover:text-white underline cursor-pointer"
                >
                  Change
                </button>
              </div>
              <button
                onClick={handleManualSync}
                disabled={syncLoading}
                className="flex items-center justify-center gap-2 px-5 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20"
              >
                <RefreshCw className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} />
                {syncLoading ? 'Syncing...' : 'Sync Progress'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleLinkLeetCode} className="flex items-center gap-3 w-full md:w-auto">
              <input
                type="text"
                value={leetcodeUsername}
                onChange={(e) => setLeetcodeUsername(e.target.value)}
                placeholder="LeetCode Username"
                required
                className="flex-1 md:w-48 px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <button
                type="submit"
                disabled={linkLoading}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm transition-all disabled:opacity-50"
              >
                {linkLoading ? 'Saving...' : 'Link Profile'}
              </button>
            </form>
          )}
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className="bg-indigo-500/10 p-3.5 rounded-xl text-indigo-400">
              <BookOpen size={24} />
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Assignments</span>
              <span className="text-2xl font-bold text-white">{totalAssignments}</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className="bg-green-500/10 p-3.5 rounded-xl text-green-400">
              <CheckCircle size={24} />
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">On-Time Solves</span>
              <span className="text-2xl font-bold text-white">{onTimeProblemsCount}</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className="bg-yellow-500/10 p-3.5 rounded-xl text-yellow-400">
              <Clock size={24} />
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Late Solves</span>
              <span className="text-2xl font-bold text-white">{lateProblemsCount}</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className="bg-red-500/10 p-3.5 rounded-xl text-red-400">
              <AlertCircle size={24} />
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Problems</span>
              <span className="text-2xl font-bold text-white">{pendingProblemsCount}</span>
            </div>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Assignments Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Assigned Assignments</h2>
              
              {dataLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  <RefreshCw className="animate-spin inline mr-2" size={16} /> Loading assignments...
                </div>
              ) : assignments.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  No assignments published yet. Keep coding!
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {assignments.map((assign) => {
                    const solved = assign.problems.filter(p => p.status !== 'PENDING').length;
                    const total = assign.problems.length;
                    const isFullySolved = solved === total && total > 0;
                    
                    return (
                      <div key={assign.assignment_id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-white text-base hover:text-indigo-400 cursor-pointer" onClick={() => openAssignmentDetails(assign)}>
                            {assign.title}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">
                            Deadline: {new Date(assign.deadline).toLocaleDateString(undefined, { 
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="block text-xs text-gray-400">Progress</span>
                            <span className={`text-sm font-bold ${isFullySolved ? 'text-green-400' : 'text-indigo-400'}`}>
                              {solved} / {total} Solved
                            </span>
                          </div>

                          <button 
                            onClick={() => openAssignmentDetails(assign)}
                            className="px-3.5 py-1.5 bg-slate-900 border border-white/5 hover:border-indigo-500/30 text-white rounded-lg text-xs font-semibold transition-all"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard Column */}
          <div className="space-y-6">
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Award className="text-yellow-500" size={20} />
                Batch Leaderboard
              </h2>

              {dataLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  Loading standings...
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  Leaderboard is empty.
                </div>
              ) : (
                <div className="space-y-3">
                  {leaderboard.map((entry) => {
                    const isCurrentUser = entry.username === currentUser?.username;
                    
                    let rankBadge = `${entry.rank}`;
                    if (entry.rank === 1) rankBadge = '🥇';
                    else if (entry.rank === 2) rankBadge = '🥈';
                    else if (entry.rank === 3) rankBadge = '🥉';

                    return (
                      <div 
                        key={entry.student_id} 
                        className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                          isCurrentUser 
                            ? 'bg-indigo-500/10 border-indigo-500/30' 
                            : 'bg-slate-950/40 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-gray-400 w-6 text-center">{rankBadge}</span>
                          <div>
                            <span className={`block text-sm font-bold ${isCurrentUser ? 'text-indigo-300' : 'text-white'}`}>
                              {entry.username}
                            </span>
                            <span className="text-[10px] text-gray-500">{entry.leetcode_username || 'No LeetCode linked'}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="block text-xs font-bold text-white">{entry.total_solved} solved</span>
                          <span className="text-[9px] text-gray-400">
                            {entry.problems_solved_on_time} on-time / {entry.problems_solved_late} late
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Assignment Details Modal */}
      {selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedAssignment.title}</h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{selectedAssignment.description}</p>
                <p className="text-[11px] text-indigo-400 mt-2 font-medium">
                  Deadline: {new Date(selectedAssignment.deadline).toLocaleString()}
                </p>
              </div>
              <button 
                onClick={() => setSelectedAssignment(null)}
                className="text-gray-400 hover:text-white text-lg font-bold p-1 bg-white/5 hover:bg-white/10 rounded-lg w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Problems List */}
            <div className="p-6 max-h-[400px] overflow-y-auto space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Assigned Problems</h4>
              
              {selectedAssignment.problems.map((prob) => {
                let statusBadge = (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
                    Pending
                  </span>
                );
                if (prob.status === 'ON_TIME') {
                  statusBadge = (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 font-medium">
                      On Time
                    </span>
                  );
                } else if (prob.status === 'LATE') {
                  statusBadge = (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-medium">
                      Late
                    </span>
                  );
                }

                let diffBadge = (
                  <span className="text-[10px] text-green-400 font-semibold uppercase">Easy</span>
                );
                if (prob.problem_difficulty === 'Medium') {
                  diffBadge = (
                    <span className="text-[10px] text-yellow-400 font-semibold uppercase">Medium</span>
                  );
                } else if (prob.problem_difficulty === 'Hard') {
                  diffBadge = (
                    <span className="text-[10px] text-red-400 font-semibold uppercase">Hard</span>
                  );
                }

                return (
                  <div key={prob.problem_id} className="flex items-center justify-between p-4 bg-slate-900/40 border border-white/5 rounded-xl">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{prob.problem_title}</span>
                        {diffBadge}
                      </div>
                      {prob.solved_at && (
                        <p className="text-[10px] text-gray-500">
                          Solved: {new Date(prob.solved_at).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {statusBadge}
                      <a
                        href={`https://leetcode.com/problems/${prob.title_slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/30 text-indigo-400 rounded-lg text-xs font-semibold transition-all"
                      >
                        Solve <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-900 border-t border-white/5 text-right">
              <button
                onClick={() => setSelectedAssignment(null)}
                className="px-4 py-2 bg-slate-800 text-gray-300 font-semibold rounded-lg hover:bg-slate-700 text-xs transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
