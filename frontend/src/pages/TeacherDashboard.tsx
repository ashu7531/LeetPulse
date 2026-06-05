import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, BookOpen, UserPlus, Award, Calendar, 
  Trash2, ChevronRight, LayoutDashboard, ArrowLeft, PlusCircle
} from 'lucide-react';
import api from '../api';
import Navbar from '../components/Navbar';
import type { Batch, Assignment, LeaderboardEntry } from '../types';

const TeacherDashboard: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchStudents, setBatchStudents] = useState<any[]>([]);
  const [batchAssignments, setBatchAssignments] = useState<Assignment[]>([]);
  const [batchLeaderboard, setBatchLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Modals / Form States
  const [activeTab, setActiveTab] = useState<'batches' | 'leaderboards'>('batches');
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);

  // Form Inputs
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDesc, setNewBatchDesc] = useState('');
  
  const [studentEmail, setStudentEmail] = useState('');

  const [assignTitle, setAssignTitle] = useState('');
  const [assignDesc, setAssignDesc] = useState('');
  const [assignDeadline, setAssignDeadline] = useState('');
  
  // Problems inside current assignment creation
  const [problemsList, setProblemsList] = useState<{ problem_id: string; title: string; title_slug: string; difficulty: 'Easy' | 'Medium' | 'Hard' }[]>([]);
  const [currentProbSlug, setCurrentProbSlug] = useState('');
  const [currentProbTitle, setCurrentProbTitle] = useState('');
  const [currentProbDiff, setCurrentProbDiff] = useState<'Easy' | 'Medium' | 'Hard'>('Easy');
  const [problemLookupLoading, setProblemLookupLoading] = useState(false);

  // Assignment Progress Detail Modal States
  const [selectedProgressAssignment, setSelectedProgressAssignment] = useState<Assignment | null>(null);
  const [assignmentProgress, setAssignmentProgress] = useState<any | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      const res = await api.get('/teacher/batches');
      setBatches(res.data);
    } catch (err) {
      console.error('Error fetching batches:', err);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/teacher/batches', { name: newBatchName, description: newBatchDesc });
      setNewBatchName('');
      setNewBatchDesc('');
      setShowCreateBatch(false);
      fetchBatches();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create batch.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBatch = async (batch: Batch) => {
    setSelectedBatch(batch);
    setLoading(true);
    try {
      const [studentsRes, assignmentsRes, leaderboardRes] = await Promise.all([
        api.get(`/teacher/batches/${batch.id}/students`),
        api.get(`/teacher/batches/${batch.id}/assignments`),
        api.get(`/teacher/batches/${batch.id}/leaderboard`),
      ]);
      setBatchStudents(studentsRes.data);
      setBatchAssignments(assignmentsRes.data);
      setBatchLeaderboard(leaderboardRes.data);
    } catch (err) {
      console.error('Error fetching batch details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/teacher/batches/${selectedBatch!.id}/students`, { email: studentEmail });
      setSuccess('Student added successfully!');
      setStudentEmail('');
      // Reload students & leaderboard
      const [studentsRes, leaderboardRes] = await Promise.all([
        api.get(`/teacher/batches/${selectedBatch!.id}/students`),
        api.get(`/teacher/batches/${selectedBatch!.id}/leaderboard`),
      ]);
      setBatchStudents(studentsRes.data);
      setBatchLeaderboard(leaderboardRes.data);
      setTimeout(() => {
        setShowAddStudent(false);
        setSuccess('');
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add student. Ensure user is registered.');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchProblemDetails = async () => {
    if (!currentProbSlug) {
      setError('Please provide a LeetCode Slug or URL to fetch.');
      return;
    }

    let slug = currentProbSlug.trim();
    if (slug.includes('leetcode.com/problems/')) {
      const match = slug.match(/leetcode\.com\/problems\/([^/]+)/);
      if (match && match[1]) {
        slug = match[1];
      }
    }

    setProblemLookupLoading(true);
    setError('');
    try {
      const res = await api.get(`/teacher/problem-details?slug=${encodeURIComponent(slug)}`);
      const details = res.data;

      setCurrentProbTitle(details.title || '');
      setCurrentProbDiff(details.difficulty as 'Easy' | 'Medium' | 'Hard' || 'Easy');
      setCurrentProbSlug(slug);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not fetch problem details from LeetCode. Double check the slug/URL.');
    } finally {
      setProblemLookupLoading(false);
    }
  };

  const handleAddProblemToDraft = () => {
    if (!currentProbSlug || !currentProbTitle) {
      setError('Please provide both a Title and Slug/URL.');
      return;
    }

    let slug = currentProbSlug.trim();
    if (slug.includes('leetcode.com/problems/')) {
      const match = slug.match(/leetcode\.com\/problems\/([^/]+)/);
      if (match && match[1]) {
        slug = match[1];
      }
    }

    const newProb = {
      problem_id: String(Date.now()),
      title: currentProbTitle.trim(),
      title_slug: slug,
      difficulty: currentProbDiff
    };

    setProblemsList([...problemsList, newProb]);
    setCurrentProbSlug('');
    setCurrentProbTitle('');
    setCurrentProbDiff('Easy');
    setError('');
  };

  const handleViewAssignmentProgress = async (assignment: Assignment) => {
    setSelectedProgressAssignment(assignment);
    setLoadingProgress(true);
    setAssignmentProgress(null);
    try {
      const res = await api.get(`/teacher/assignments/${assignment.id}/progress`);
      setAssignmentProgress(res.data);
    } catch (err) {
      console.error('Error fetching assignment progress:', err);
    } finally {
      setLoadingProgress(false);
    }
  };

  const handleRemoveProblemFromDraft = (index: number) => {
    setProblemsList(problemsList.filter((_, i) => i !== index));
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problemsList.length === 0) {
      setError('Add at least one LeetCode problem.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post(`/teacher/batches/${selectedBatch!.id}/assignments`, {
        title: assignTitle,
        description: assignDesc,
        deadline: assignDeadline,
        problems: problemsList
      });
      
      setAssignTitle('');
      setAssignDesc('');
      setAssignDeadline('');
      setProblemsList([]);
      setShowCreateAssignment(false);
      
      // Reload assignments
      const res = await api.get(`/teacher/batches/${selectedBatch!.id}/assignments`);
      setBatchAssignments(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to publish assignment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19]">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Navigation Tabs (Only visible when not deep into batch detail) */}
        {!selectedBatch && (
          <div className="flex border-b border-white/5 mb-8">
            <button
              onClick={() => setActiveTab('batches')}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-semibold transition-all ${
                activeTab === 'batches'
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <LayoutDashboard size={16} />
              Batches ({batches.length})
            </button>
            <button
              onClick={() => setActiveTab('leaderboards')}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-semibold transition-all ${
                activeTab === 'leaderboards'
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <Award size={16} />
              Unified Leaderboards
            </button>
          </div>
        )}

        {/* Tab Content: Batches Grid */}
        {!selectedBatch && activeTab === 'batches' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white m-0">My Batches</h2>
                <p className="text-xs text-gray-400 mt-1">Manage classes, invite students, and review assignment statuses.</p>
              </div>
              <button
                onClick={() => setShowCreateBatch(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25"
              >
                <Plus size={16} />
                Create Batch
              </button>
            </div>

            {batches.length === 0 ? (
              <div className="glass-card rounded-2xl py-16 text-center text-gray-400 text-sm">
                No batches created yet. Click "Create Batch" above to start.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {batches.map((batch) => (
                  <div 
                    key={batch.id} 
                    onClick={() => handleSelectBatch(batch)}
                    className="glass-card glass-card-hover rounded-2xl p-6 cursor-pointer flex flex-col justify-between h-48"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-white text-lg m-0">{batch.name}</h3>
                        <ChevronRight className="text-gray-500" size={18} />
                      </div>
                      <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed">{batch.description}</p>
                    </div>

                    <div className="flex justify-between items-center border-t border-white/5 pt-4">
                      <span className="text-xs text-indigo-400 font-semibold flex items-center gap-1">
                        <Users size={14} />
                        {batch.student_count || 0} enrolled
                      </span>
                      <span className="text-[10px] text-gray-500">
                        Created {new Date(batch.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Leaderboards (Batch selector) */}
        {!selectedBatch && activeTab === 'leaderboards' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">Select Batch to View Standings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {batches.map((batch) => (
                <div 
                  key={batch.id}
                  onClick={() => {
                    handleSelectBatch(batch);
                    setActiveTab('batches'); // reset to show batch details tab
                  }}
                  className="glass-card glass-card-hover rounded-2xl p-6 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-yellow-500/10 p-3.5 rounded-xl text-yellow-500">
                      <Award size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base m-0">{batch.name}</h3>
                      <p className="text-xs text-gray-400">{batch.student_count || 0} students</p>
                    </div>
                  </div>
                  <ChevronRight className="text-gray-500" size={18} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Batch Detail View (Deep dive) */}
        {selectedBatch && (
          <div className="space-y-6">
            {/* Header / Back */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/5">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedBatch(null)}
                  className="p-2 bg-slate-900 border border-white/5 hover:border-indigo-500/30 text-gray-400 hover:text-white rounded-xl transition-all"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-white m-0">{selectedBatch.name}</h1>
                  <p className="text-xs text-gray-400 mt-1">{selectedBatch.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAddStudent(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-white/5 hover:border-indigo-500/30 text-white text-xs font-semibold rounded-xl transition-all"
                >
                  <UserPlus size={14} />
                  Add Student
                </button>
                <button
                  onClick={() => setShowCreateAssignment(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all"
                >
                  <BookOpen size={14} />
                  New Assignment
                </button>
              </div>
            </div>

            {/* Batch Stats & Details Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Assignments */}
              <div className="lg:col-span-2 space-y-6">
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-white mb-4">Assignments</h2>
                  
                  {batchAssignments.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">
                      No assignments published in this batch yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {batchAssignments.map((assign) => (
                        <div 
                          key={assign.id} 
                          onClick={() => handleViewAssignmentProgress(assign)}
                          className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4 cursor-pointer group hover:bg-white/5 px-4 rounded-xl -mx-4 transition-all"
                        >
                          <div>
                            <h3 className="font-semibold text-white text-base group-hover:text-indigo-400 transition-colors">{assign.title}</h3>
                            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{assign.description}</p>
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400 font-medium mt-2">
                              <Calendar size={10} />
                              Deadline: {new Date(assign.deadline).toLocaleString()}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-xs font-bold text-white">
                                {assign.total_problems || 0} Problems
                              </span>
                            </div>
                            <ChevronRight size={16} className="text-gray-500 group-hover:text-indigo-400 transition-colors" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Student Enrollment List */}
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Users size={18} className="text-indigo-400" />
                    Enrolled Students ({batchStudents.length})
                  </h2>

                  {batchStudents.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">
                      No students enrolled. Click "Add Student" to enroll by email.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {batchStudents.map((stud) => (
                        <div key={stud.id} className="p-4 bg-slate-900/40 border border-white/5 rounded-xl flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                            <Users size={18} />
                          </div>
                          <div>
                            <span className="block text-sm font-bold text-white">{stud.username}</span>
                            <span className="block text-xs text-gray-500">{stud.email}</span>
                            {stud.leetcode_username ? (
                              <span className="inline-block text-[10px] text-yellow-400 font-semibold mt-1">
                                {stud.leetcode_username}
                              </span>
                            ) : (
                              <span className="inline-block text-[10px] text-gray-500 mt-1">
                                No LeetCode linked
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Leaderboard */}
              <div>
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Award className="text-yellow-500" size={18} />
                    Standings
                  </h2>

                  {batchLeaderboard.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">
                      Standings will calculate once submissions sync.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {batchLeaderboard.map((entry) => {
                        let rankBadge = `${entry.rank}`;
                        if (entry.rank === 1) rankBadge = '🏆';
                        else if (entry.rank === 2) rankBadge = '🥈';
                        else if (entry.rank === 3) rankBadge = '🥉';

                        return (
                          <div key={entry.student_id} className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-white/5 rounded-xl">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-gray-400 w-6 text-center">{rankBadge}</span>
                              <div>
                                <span className="block text-sm font-bold text-white">{entry.username}</span>
                                <span className="text-[10px] text-gray-500">{entry.leetcode_username || 'No LeetCode'}</span>
                              </div>
                            </div>

                            <div className="text-right leading-tight">
                              <span className="block text-xs font-bold text-white">{entry.total_solved} solved</span>
                              <span className="text-[9px] text-gray-400">
                                {entry.problems_solved_on_time} on-time
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
          </div>
        )}
      </main>

      {/* MODAL: Create Batch */}
      {showCreateBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white m-0">Create New Batch</h3>
              <button onClick={() => setShowCreateBatch(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <form onSubmit={handleCreateBatch} className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-500/10 text-red-400 text-xs rounded-lg">{error}</div>}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Batch Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spring 2026 - CS 101"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Description</label>
                <textarea
                  placeholder="Introduce the batch syllabus, rules or guidelines..."
                  rows={3}
                  value={newBatchDesc}
                  onChange={(e) => setNewBatchDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateBatch(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs"
                >
                  {loading ? 'Creating...' : 'Create Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Student */}
      {showAddStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white m-0">Enroll Student</h3>
              <button onClick={() => setShowAddStudent(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <form onSubmit={handleAddStudent} className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-500/10 text-red-400 text-xs rounded-lg">{error}</div>}
              {success && <div className="p-3 bg-green-500/10 text-green-400 text-xs rounded-lg">{success}</div>}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Student Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="student@school.edu"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <p className="text-[10px] text-gray-400 mt-2">
                  The student must register an account with this email address first so they can be identified.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudent(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs"
                >
                  {loading ? 'Adding...' : 'Enroll Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Assignment */}
      {showCreateAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white m-0">Publish Assignment</h3>
              <button onClick={() => setShowCreateAssignment(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <form onSubmit={handleCreateAssignment} className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-500/10 text-red-400 text-xs rounded-lg">{error}</div>}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Assignment Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Recursion & Divide and Conquer"
                    value={assignTitle}
                    onChange={(e) => setAssignTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Description</label>
                  <textarea
                    placeholder="Provide notes or guidelines for this assignment..."
                    rows={2}
                    value={assignDesc}
                    onChange={(e) => setAssignDesc(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Deadline</label>
                  <input
                    type="datetime-local"
                    required
                    value={assignDeadline}
                    onChange={(e) => setAssignDeadline(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>

              {/* Draft LeetCode Problems */}
              <div className="border-t border-white/5 pt-4">
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">LeetCode Problems List</h4>
                
                {problemsList.length > 0 && (
                  <div className="mb-4 space-y-2 max-h-32 overflow-y-auto">
                    {problemsList.map((p, index) => (
                      <div key={index} className="flex items-center justify-between p-2.5 bg-slate-900 border border-white/5 rounded-xl text-xs">
                        <div>
                          <span className="font-semibold text-white">{p.title}</span>
                          <span className="text-gray-400 ml-2">({p.title_slug})</span>
                          <span className={`ml-2 font-bold ${
                            p.difficulty === 'Easy' ? 'text-green-400' : p.difficulty === 'Medium' ? 'text-yellow-400' : 'text-red-400'
                          }`}>{p.difficulty}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveProblemFromDraft(index)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Form to add problem to draft list */}
                <div className="space-y-3 p-4 bg-slate-900/40 border border-white/5 rounded-2xl">
                  <div className="flex flex-col md:flex-row gap-3 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">LeetCode Problem Slug or URL</label>
                      <input
                        type="text"
                        placeholder="e.g. two-sum or https://leetcode.com/problems/two-sum"
                        value={currentProbSlug}
                        onChange={(e) => setCurrentProbSlug(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/5 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={problemLookupLoading}
                      onClick={handleFetchProblemDetails}
                      className="w-full md:w-auto px-5 py-2.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <PlusCircle size={14} /> 
                      {problemLookupLoading ? 'Fetching...' : 'Fetch Details'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Problem Title (Editable)</label>
                      <input
                        type="text"
                        placeholder="Problem Title"
                        value={currentProbTitle}
                        onChange={(e) => setCurrentProbTitle(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/5 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Difficulty</label>
                      <select
                        value={currentProbDiff}
                        onChange={(e) => setCurrentProbDiff(e.target.value as any)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/5 rounded-lg text-xs text-white focus:outline-none"
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleAddProblemToDraft}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/10"
                    >
                      <PlusCircle size={14} /> Add Problem
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateAssignment(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 font-semibold rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs"
                >
                  {loading ? 'Publishing...' : 'Publish Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL: Assignment Progress Matrix */}
      {selectedProgressAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-6 bg-slate-900 border-b border-white/5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white m-0">
                  Assignment Progress: {selectedProgressAssignment.title}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Deadline: {new Date(selectedProgressAssignment.deadline).toLocaleString()}
                </p>
              </div>
              <button 
                onClick={() => setSelectedProgressAssignment(null)} 
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-x-auto max-h-[70vh]">
              {loadingProgress ? (
                <div className="py-20 text-center text-gray-400 text-sm flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Fetching progress matrix...</span>
                </div>
              ) : assignmentProgress ? (
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 bg-slate-900/40">
                      <th className="py-3 px-4 font-semibold text-gray-400">Student</th>
                      <th className="py-3 px-4 font-semibold text-gray-400">LeetCode Username</th>
                      {assignmentProgress.problems.map((prob: any) => (
                        <th key={prob.id} className="py-3 px-4 font-semibold text-gray-400">
                          <span className="block">{prob.title}</span>
                          <span className={`text-[10px] uppercase font-bold ${
                            prob.difficulty === 'Easy' ? 'text-green-400' : prob.difficulty === 'Medium' ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {prob.difficulty}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {assignmentProgress.student_progress.length === 0 ? (
                      <tr>
                        <td colSpan={2 + assignmentProgress.problems.length} className="py-8 text-center text-gray-500">
                          No students currently enrolled in this batch.
                        </td>
                      </tr>
                    ) : (
                      assignmentProgress.student_progress.map((student: any) => (
                        <tr key={student.student_id} className="hover:bg-white/5">
                          <td className="py-4 px-4">
                            <span className="font-semibold text-white block">{student.username}</span>
                            <span className="text-gray-500 text-[10px]">{student.email}</span>
                          </td>
                          <td className="py-4 px-4 font-medium text-gray-400">
                            {student.leetcode_username ? (
                              <span className="text-indigo-400">{student.leetcode_username}</span>
                            ) : (
                              <span className="text-red-400/80 italic text-[10px]">Not linked</span>
                            )}
                          </td>
                          {assignmentProgress.problems.map((prob: any) => {
                            const prog = student.progress[prob.id] || { status: 'PENDING', solved_at: null };
                            return (
                              <td key={prob.id} className="py-4 px-4">
                                <div className="flex flex-col gap-1">
                                  <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    prog.status === 'ON_TIME'
                                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                      : prog.status === 'LATE'
                                      ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    {prog.status === 'ON_TIME' ? 'On Time' : prog.status === 'LATE' ? 'Late' : 'Pending'}
                                  </span>
                                  {prog.solved_at && (
                                    <span className="text-[9px] text-gray-500">
                                      {new Date(prog.solved_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center text-red-400 text-sm">
                  Failed to load assignment progress details.
                </div>
              )}
            </div>
            
            <div className="p-6 bg-slate-900 border-t border-white/5 flex justify-end">
              <button 
                onClick={() => setSelectedProgressAssignment(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 font-semibold rounded-lg text-xs"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
