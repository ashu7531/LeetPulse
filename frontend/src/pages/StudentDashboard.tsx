import React, { useState, useEffect } from 'react';
import { 
  Award, BookOpen, CheckCircle, Clock, AlertCircle, 
  ExternalLink, RefreshCw, Link as LinkIcon, Code, FileText, Check, LogOut, Users, Copy
} from 'lucide-react';
import api from '../api';
import Navbar from '../components/Navbar';
import type { StudentAssignmentProgress, LeaderboardEntry, User } from '../types';

const StudentDashboard: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignmentProgress[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<StudentAssignmentProgress | null>(null);
  const [leetcodeStats, setLeetcodeStats] = useState<{ all: number; easy: number; medium: number; hard: number } | null>(null);
  
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'assignments' | 'leaderboard'>('assignments');

  // Input states
  const [leetcodeUsername, setLeetcodeUsername] = useState('');
  const [editingLeetcode, setEditingLeetcode] = useState(false);
  const [batchJoinCode, setBatchJoinCode] = useState('');
  
  // Loading states
  const [linkLoading, setLinkLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Manual Submission States
  const [submittingProgressId, setSubmittingProgressId] = useState<number | null>(null);
  const [submitLanguage, setSubmitLanguage] = useState('python');
  const [submitCode, setSubmitCode] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  // Code Viewer States
  const [viewingCode, setViewingCode] = useState<string | null>(null);
  const [viewingLanguage, setViewingLanguage] = useState<string | null>(null);
  const [viewingProblemTitle, setViewingProblemTitle] = useState<string | null>(null);

  // Sync Cooldown State
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  useEffect(() => {
    // Only restore the leetcode username input from cache for UX convenience.
    // Do NOT restore currentUser from localStorage - always trust the fresh API response.
    // This prevents the bug where a stale cached user object shows
    // 'leetcode_username' as already set even after a fresh registration.
    const userJson = localStorage.getItem('user');
    if (userJson) {
      try {
        const parsed = JSON.parse(userJson);
        // Only pre-fill the text input, not the full user object
        setLeetcodeUsername(parsed.leetcode_username || '');
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (currentUser?.last_synced_at) {
      // Add 'Z' to ensure it's parsed as UTC if the backend didn't append it
      const syncTimeStr = currentUser.last_synced_at.endsWith('Z') 
        ? currentUser.last_synced_at 
        : currentUser.last_synced_at + 'Z';
      
      const syncTime = new Date(syncTimeStr).getTime();
      const now = new Date().getTime();
      const diffSeconds = Math.floor((now - syncTime) / 1000);
      const remaining = 600 - diffSeconds; // 10 minutes = 600 seconds
      
      if (remaining > 0) {
        setCooldownSeconds(remaining);
      } else {
        setCooldownSeconds(0);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (cooldownSeconds > 0) {
      interval = setInterval(() => {
        setCooldownSeconds(prev => prev > 0 ? prev - 1 : 0);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const fetchDashboardData = async () => {
    setDataLoading(true);
    try {
      // Phase 1: Always fetch the user profile first — it's cheap and determines
      // whether the student has completed onboarding (linked LeetCode + joined a batch).
      const meRes = await api.get('/auth/me');
      const user = meRes.data;
      setCurrentUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      if (user.leetcode_stats) {
        setLeetcodeStats(user.leetcode_stats);
      }

      // Phase 2: Only fetch assignments & leaderboard if the student is fully onboarded.
      // No point hitting these APIs during the onboarding steps — they'd return empty arrays anyway.
      const fullyOnboarded = user.leetcode_username && user.batches && user.batches.length > 0;
      if (fullyOnboarded) {
        const [assignmentsRes, leaderboardRes] = await Promise.all([
          api.get('/student/assignments'),
          api.get('/student/leaderboard'),
        ]);
        setAssignments(assignmentsRes.data);
        setLeaderboard(leaderboardRes.data);
      } else {
        // Clear stale data in case the user just left a batch
        setAssignments([]);
        setLeaderboard([]);
      }
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
      const res = await api.post('/student/link-leetcode', { leetcode_username: leetcodeUsername });
      const updatedUser = res.data.user;
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      if (updatedUser.leetcode_stats) {
        setLeetcodeStats(updatedUser.leetcode_stats);
      }
      setMessage({ text: 'LeetCode profile linked successfully!', type: 'success' });
      setEditingLeetcode(false);
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

  const handleJoinBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinLoading(true);
    setMessage(null);
    try {
      const res = await api.post('/student/join-batch', { join_code: batchJoinCode });
      setMessage({ text: res.data.message, type: 'success' });
      setBatchJoinCode('');
      fetchDashboardData();
    } catch (err: any) {
      setMessage({
        text: err.response?.data?.message || 'Failed to join batch.',
        type: 'error'
      });
    } finally {
      setJoinLoading(false);
    }
  };

  const handleLeaveBatch = async () => {
    if (!window.confirm('Are you sure you want to leave this batch? All your assignment progress records for this batch will be permanently deleted.')) {
      return;
    }
    setLeaveLoading(true);
    setMessage(null);
    try {
      // Pass the specific batch_id so the backend knows which batch to leave
      const batchId = currentBatch?.id;
      const res = await api.post('/student/leave-batch', batchId ? { batch_id: batchId } : {});
      setMessage({ text: res.data.message, type: 'success' });
      fetchDashboardData();
    } catch (err: any) {
      setMessage({
        text: err.response?.data?.message || 'Failed to leave batch.',
        type: 'error'
      });
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncLoading(true);
    setMessage(null);
    try {
      const res = await api.post('/student/sync-progress');
      if (res.data.leetcode_stats) {
        setLeetcodeStats(res.data.leetcode_stats);
      }
      setMessage({ 
        text: `Progress synced! ${res.data.synced_count} new solves verified.`, 
        type: 'success' 
      });
      // Start cooldown immediately on successful sync
      setCooldownSeconds(600);
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

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingProgressId) return;
    setSubmitLoading(true);
    setMessage(null);
    try {
      const res = await api.post(`/student/progress/${submittingProgressId}/submit-code`, {
        submitted_code: submitCode,
        submission_language: submitLanguage
      });
      setMessage({ text: res.data.message, type: 'success' });
      setSubmitCode('');
      setSubmittingProgressId(null);
      
      // Reload assignment details modal if currently open
      if (selectedAssignment) {
        const detailedRes = await api.get(`/student/assignments/${selectedAssignment.assignment_id}`);
        setSelectedAssignment(detailedRes.data);
      }
      fetchDashboardData();
    } catch (err: any) {
      setMessage({
        text: err.response?.data?.message || 'Failed to submit code solution.',
        type: 'error'
      });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
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

  const isLinked = !!currentUser?.leetcode_username;
  const isEnrolled = !!(currentUser?.batches && currentUser.batches.length > 0);
  const showOnboarding = (!isLinked || !isEnrolled) && !editingLeetcode;
  const currentBatch = isEnrolled ? currentUser?.batches?.[0] : null;

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

        {/* ONBOARDING SCREEN */}
        {showOnboarding && !dataLoading && (
          <div className="max-w-xl mx-auto my-12">
            <div className="glass-card rounded-2xl p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white m-0">Welcome to LeetTrack!</h2>
                <p className="text-sm text-gray-400 mt-2">Let's get your dashboard set up in two quick steps.</p>
              </div>

              <div className="space-y-4">
                {/* Step 1 Card: LeetCode linking */}
                <div className={`p-5 rounded-xl border ${isLinked ? 'bg-green-500/5 border-green-500/20' : 'bg-slate-900/60 border-white/5'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg ${isLinked ? 'bg-green-500/10 text-green-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                        {isLinked ? <Check size={18} /> : <LinkIcon size={18} />}
                      </div>
                      <div>
                        <span className="block text-sm font-bold text-white">Step 1: Link LeetCode Account</span>
                        <span className="text-xs text-gray-400">Allows progress verification.</span>
                      </div>
                    </div>
                    {isLinked && !editingLeetcode && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                          Linked
                        </span>
                        <button
                          onClick={() => {
                            setLeetcodeUsername(currentUser.leetcode_username || '');
                            setEditingLeetcode(true);
                          }}
                          className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 px-2 py-0.5 rounded-full transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>

                  {(!isLinked || editingLeetcode) && (
                    <form onSubmit={handleLinkLeetCode} className="flex items-center gap-3 mt-4">
                      <input
                        type="text"
                        value={leetcodeUsername}
                        onChange={(e) => setLeetcodeUsername(e.target.value)}
                        placeholder="LeetCode Username"
                        required
                        className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                      <button
                        type="submit"
                        disabled={linkLoading}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-xs transition-all disabled:opacity-50"
                      >
                        {linkLoading ? 'Saving...' : (isLinked ? 'Update Profile' : 'Link Profile')}
                      </button>
                      {editingLeetcode && isLinked && (
                        <button
                          type="button"
                          onClick={() => setEditingLeetcode(false)}
                          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-xs transition-all"
                        >
                          Cancel
                        </button>
                      )}
                    </form>
                  )}
                </div>

                {/* Step 2 Card: Join Batch */}
                <div className={`p-5 rounded-xl border ${isEnrolled ? 'bg-green-500/5 border-green-500/20' : 'bg-slate-900/60 border-white/5'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg ${isEnrolled ? 'bg-green-500/10 text-green-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                        {isEnrolled ? <Check size={18} /> : <Users size={18} />}
                      </div>
                      <div>
                        <span className="block text-sm font-bold text-white">Step 2: Join Class Batch</span>
                        <span className="text-xs text-gray-400">Enter code provided by your teacher.</span>
                      </div>
                    </div>
                    {isEnrolled && (
                      <span className="text-[10px] uppercase font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                        Enrolled
                      </span>
                    )}
                  </div>

                  {!isEnrolled && (
                    <form onSubmit={handleJoinBatch} className="flex items-center gap-3 mt-4">
                      <input
                        type="text"
                        value={batchJoinCode}
                        onChange={(e) => setBatchJoinCode(e.target.value)}
                        placeholder="Batch Join Code (e.g. X7A9B2)"
                        required
                        className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                      <button
                        type="submit"
                        disabled={joinLoading}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-xs transition-all disabled:opacity-50"
                      >
                        {joinLoading ? 'Joining...' : 'Join Class'}
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-white/5">
                <button
                  onClick={fetchDashboardData}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw size={12} /> Refresh Status
                </button>
                <button
                  onClick={handleLogout}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1.5"
                >
                  <LogOut size={12} /> Log Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE DASHBOARD SCREEN */}
        {!showOnboarding && (
          <div className="space-y-8 animate-fade-in">
            {/* Header / Info Row */}
            <div className="glass-card rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-2 m-0">
                  <Users className="text-indigo-400" size={20} />
                  My Class Batch: {currentBatch?.name}
                </h2>
                <p className="text-xs text-gray-400 mt-1 max-w-2xl">{currentBatch?.description}</p>
                
                {currentUser?.leetcode_username && !editingLeetcode && (
                  <div className="text-[10px] text-indigo-400 font-semibold flex items-center gap-1.5 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    LeetCode Profile: <span className="text-white font-bold">{currentUser.leetcode_username}</span>
                    <button
                      onClick={() => {
                        setLeetcodeUsername(currentUser.leetcode_username || '');
                        setEditingLeetcode(true);
                      }}
                      className="text-gray-400 hover:text-white underline ml-1"
                    >
                      (Edit)
                    </button>
                    {currentUser.last_synced_at && (
                      <span className="text-gray-500 ml-2">| Last verified: {new Date(currentUser.last_synced_at).toLocaleString()}</span>
                    )}
                  </div>
                )}
                
                {editingLeetcode && (
                  <form onSubmit={handleLinkLeetCode} className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={leetcodeUsername}
                      onChange={(e) => setLeetcodeUsername(e.target.value)}
                      placeholder="LeetCode Username"
                      required
                      className="px-2 py-1 bg-slate-900 border border-white/10 rounded text-[10px] text-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={linkLoading}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded text-[10px] disabled:opacity-50"
                    >
                      {linkLoading ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingLeetcode(false)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded text-[10px]"
                    >
                      Cancel
                    </button>
                  </form>
                )}
                
                {leetcodeStats && !editingLeetcode && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[9px] bg-slate-900 border border-white/5 px-2 py-0.5 rounded text-gray-300">
                      Solved: <span className="font-bold text-white">{leetcodeStats.all}</span>
                    </span>
                    <span className="text-[9px] bg-green-500/10 border border-green-500/15 px-2 py-0.5 rounded text-green-400">
                      Easy: <span className="font-bold">{leetcodeStats.easy}</span>
                    </span>
                    <span className="text-[9px] bg-yellow-500/10 border border-yellow-500/15 px-2 py-0.5 rounded text-yellow-400">
                      Medium: <span className="font-bold">{leetcodeStats.medium}</span>
                    </span>
                    <span className="text-[9px] bg-red-500/10 border border-red-500/15 px-2 py-0.5 rounded text-red-400">
                      Hard: <span className="font-bold">{leetcodeStats.hard}</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleManualSync}
                  disabled={syncLoading || cooldownSeconds > 0}
                  className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-xs font-semibold transition-all ${
                    cooldownSeconds > 0 
                      ? 'bg-slate-900/50 border-white/5 text-gray-500 cursor-not-allowed'
                      : 'bg-slate-900 border-white/5 hover:border-indigo-500/30 text-white'
                  }`}
                  title={cooldownSeconds > 0 ? "You can sync again shortly." : "Manually sync progress with LeetCode"}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                  {cooldownSeconds > 0 
                    ? `Syncing available in ${Math.floor(cooldownSeconds / 60)}:${(cooldownSeconds % 60).toString().padStart(2, '0')}`
                    : 'Sync LeetCode Status'}
                </button>
                <button
                  onClick={handleLeaveBatch}
                  disabled={leaveLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-950/20 border border-red-500/15 hover:border-red-500/30 text-red-400 rounded-xl text-xs font-semibold transition-all"
                >
                  Leave Class Batch
                </button>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="glass-card rounded-xl p-5 flex items-center gap-4">
                <div className="bg-indigo-500/10 p-3 rounded-lg text-indigo-400">
                  <BookOpen size={20} />
                </div>
                <div>
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Assignments</span>
                  <span className="text-xl font-bold text-white">{totalAssignments}</span>
                </div>
              </div>
              <div className="glass-card rounded-xl p-5 flex items-center gap-4">
                <div className="bg-green-500/10 p-3 rounded-lg text-green-400">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">On-Time</span>
                  <span className="text-xl font-bold text-white">{onTimeProblemsCount}</span>
                </div>
              </div>
              <div className="glass-card rounded-xl p-5 flex items-center gap-4">
                <div className="bg-yellow-500/10 p-3 rounded-lg text-yellow-400">
                  <Clock size={20} />
                </div>
                <div>
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Late</span>
                  <span className="text-xl font-bold text-white">{lateProblemsCount}</span>
                </div>
              </div>
              <div className="glass-card rounded-xl p-5 flex items-center gap-4">
                <div className="bg-red-500/10 p-3 rounded-lg text-red-400">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pending</span>
                  <span className="text-xl font-bold text-white">{pendingProblemsCount}</span>
                </div>
              </div>
            </div>

            {/* Section Toggles */}
            <div className="flex border-b border-white/5">
              <button
                onClick={() => setActiveTab('assignments')}
                className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-semibold transition-all ${
                  activeTab === 'assignments'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <BookOpen size={16} />
                Class Assignments ({assignments.length})
              </button>
              <button
                onClick={() => setActiveTab('leaderboard')}
                className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-semibold transition-all ${
                  activeTab === 'leaderboard'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Award size={16} />
                Leaderboard Rankings
              </button>
            </div>

            {/* Assignments View */}
            {activeTab === 'assignments' && (
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Assigned Tasks</h3>
                {dataLoading ? (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    <RefreshCw className="animate-spin inline mr-2" size={16} /> Loading assignments...
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    No assignments currently assigned.
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
                            <h4 className="font-semibold text-white text-base hover:text-indigo-400 cursor-pointer" onClick={() => openAssignmentDetails(assign)}>
                              {assign.title}
                            </h4>
                            <p className="text-xs text-gray-400 mt-1">{assign.description}</p>
                            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 mt-2">
                              Deadline: {new Date(assign.deadline).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span className="block text-[10px] text-gray-500">Solved Status</span>
                              <span className={`text-xs font-bold ${isFullySolved ? 'text-green-400' : 'text-indigo-400'}`}>
                                {solved} / {total} problems
                              </span>
                            </div>

                            <button 
                              onClick={() => openAssignmentDetails(assign)}
                              className="px-3.5 py-1.5 bg-slate-900 border border-white/5 hover:border-indigo-500/30 text-white rounded-lg text-xs font-semibold transition-all"
                            >
                              Open Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard View */}
            {activeTab === 'leaderboard' && (
              <div className="glass-card rounded-2xl p-6 max-w-2xl">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Award className="text-yellow-500" size={20} />
                    LeetCode Global Rankings
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">Ranked by total LeetCode problems solved across all difficulties. Sync your progress to update your count.</p>
                </div>

                {dataLoading ? (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    Loading standings...
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    No students have linked their LeetCode accounts yet. Sync your progress to appear here.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {leaderboard.map((entry: any) => {
                      const isCurrentUser = entry.username === currentUser?.username;
                      
                      let rankBadge = `${entry.rank}`;
                      if (entry.rank === 1) rankBadge = '🥇';
                      else if (entry.rank === 2) rankBadge = '🥈';
                      else if (entry.rank === 3) rankBadge = '🥉';

                      return (
                        <div 
                          key={entry.student_id} 
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                            isCurrentUser 
                              ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/5' 
                              : 'bg-slate-950/40 border-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-gray-400 w-6 text-center">{rankBadge}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`block text-sm font-bold ${isCurrentUser ? 'text-indigo-300' : 'text-white'}`}>
                                  {entry.username}
                                </span>
                                {isCurrentUser && (
                                  <span className="text-[9px] bg-indigo-500/20 text-indigo-300 font-bold px-1.5 py-0.5 rounded uppercase">
                                    You
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-500 block mt-0.5">{entry.leetcode_username || 'No LeetCode linked'}</span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="block text-xs font-bold text-white">{entry.lc_total_solved ?? 0} solved</span>
                            <div className="flex gap-2 justify-end mt-1">
                              <span className="text-[9px] text-green-400">{entry.lc_easy_solved ?? 0}E</span>
                              <span className="text-[9px] text-yellow-400">{entry.lc_medium_solved ?? 0}M</span>
                              <span className="text-[9px] text-red-400">{entry.lc_hard_solved ?? 0}H</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: Assignment Details */}
      {selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedAssignment.title}</h3>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{selectedAssignment.description}</p>
                <p className="text-[10px] text-indigo-400 mt-2 font-semibold bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 w-fit rounded-lg">
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
            <div className="p-6 max-h-[350px] overflow-y-auto space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Problems</h4>
              
              {selectedAssignment.problems.map((prob) => {
                const hasCode = !!prob.submitted_code;
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
                  <div key={prob.problem_id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-900/40 border border-white/5 rounded-xl gap-4">
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
                      {prob.status !== 'PENDING' && hasCode && (
                        <button
                          onClick={() => {
                            setViewingCode(prob.submitted_code || '');
                            setViewingLanguage(prob.submission_language || '');
                            setViewingProblemTitle(prob.problem_title);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg text-xs font-semibold transition-all"
                        >
                          <FileText size={12} /> View Code
                        </button>
                      )}
                      {prob.status === 'PENDING' && (
                        <button
                          onClick={() => setSubmittingProgressId(prob.progress_id || null)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-400 rounded-lg text-xs font-bold transition-all"
                        >
                          <Code size={12} /> Submit Code
                        </button>
                      )}
                      <a
                        href={`https://leetcode.com/problems/${prob.title_slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-lg text-xs font-semibold transition-all"
                      >
                        LeetCode <ExternalLink size={11} />
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
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Submit solution Code */}
      {submittingProgressId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white m-0">Submit Problem Solution</h3>
              <button 
                onClick={() => setSubmittingProgressId(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCodeSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Select Programming Language
                </label>
                <select
                  value={submitLanguage}
                  onChange={(e) => setSubmitLanguage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="python">Python 3</option>
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="golang">Go</option>
                  <option value="rust">Rust</option>
                  <option value="csharp">C#</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Paste Code Solution
                </label>
                <textarea
                  value={submitCode}
                  onChange={(e) => setSubmitCode(e.target.value)}
                  required
                  rows={8}
                  placeholder="// Paste your correct LeetCode solution code snippet here..."
                  className="w-full px-3.5 py-3 bg-slate-950 border border-white/10 rounded-xl text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setSubmittingProgressId(null)}
                  className="px-4 py-2 bg-slate-800 text-gray-300 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition-all disabled:opacity-50"
                >
                  {submitLoading ? 'Submitting...' : 'Submit Solution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Code Viewer */}
      {viewingCode !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white m-0">Submitted Code: {viewingProblemTitle}</h3>
                <span className="text-[10px] text-indigo-400 uppercase font-bold mt-1 block">Language: {viewingLanguage}</span>
              </div>
              <button 
                onClick={() => {
                  setViewingCode(null);
                  setViewingLanguage(null);
                  setViewingProblemTitle(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Solution Code Snippet</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(viewingCode || '');
                    setMessage({ text: 'Code copied to clipboard!', type: 'success' });
                    setTimeout(() => setMessage(null), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-white/5 border border-white/5 text-gray-300 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  <Copy size={12} /> Copy Code
                </button>
              </div>
              <pre className="p-4 bg-slate-950 border border-white/5 rounded-xl text-xs text-white font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
                {viewingCode}
              </pre>
            </div>

            <div className="p-4 bg-slate-900 border-t border-white/5 text-right">
              <button
                onClick={() => {
                  setViewingCode(null);
                  setViewingLanguage(null);
                  setViewingProblemTitle(null);
                }}
                className="px-4 py-2 bg-slate-800 text-gray-300 font-semibold rounded-lg text-xs"
              >
                Close Solution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
