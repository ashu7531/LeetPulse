import requests
import datetime
from models import db, User, StudentProgress, AssignmentProblem, Assignment
import os
from celery import shared_task

# Helper to fetch recent accepted submissions from LeetCode
def fetch_leetcode_submissions(username):
    url = "https://leetcode.com/graphql"
    query = """
    query userRecentSubmissions($username: String!, $limit: Int!) {
      recentSubmissionList(username: $username, limit: $limit) {
        title
        titleSlug
        timestamp
        statusDisplay
        lang
      }
    }
    """
    payload = {
        "query": query,
        "variables": {
            "username": username,
            "limit": 50  # Fetch recent 50 submissions
        }
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            data = response.json()
            submissions = data.get("data", {}).get("recentSubmissionList", [])
            # Return only accepted ones
            accepted = [sub for sub in submissions if sub.get("statusDisplay") == "Accepted"]
            return accepted
        return []
    except Exception as e:
        print(f"Error fetching from LeetCode for user {username}: {str(e)}")
        return []

# Sends email notifications via Resend API
def send_email_via_resend(to_email, subject, html_content):
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        print(f"[Email Logger] (RESEND_API_KEY not set) -> To: {to_email} | Subject: {subject}")
        return False
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "from": "LeetTrack <onboarding@resend.dev>",  # default sandbox email
        "to": [to_email],
        "subject": subject,
        "html": html_content
    }
    
    try:
        res = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=10)
        if res.status_code in [200, 201]:
            print(f"Email sent successfully to {to_email} via Resend.")
            return True
        else:
            print(f"Failed to send email to {to_email}: {res.text}")
            return False
    except Exception as e:
        print(f"Error calling Resend API: {str(e)}")
        return False

# Primary sync function for a student
@shared_task(name='tasks.sync_student_progress_task', bind=True, max_retries=3)
def sync_student_progress_task(self, student_id):
    student = User.query.get(student_id)
    if not student or not student.leetcode_username:
        return 0
    
    print(f"\n[WORKER TRACKER] 🚀 Worker grabbed task! Scraping LeetCode for student: {student.leetcode_username}...")
    
    submissions = fetch_leetcode_submissions(student.leetcode_username)
    if not submissions:
        return 0
    
    # Get all pending progress records for this student
    pending_records = StudentProgress.query.join(AssignmentProblem).filter(
        StudentProgress.student_id == student_id,
        StudentProgress.status == 'PENDING'
    ).all()
    
    if not pending_records:
        return 0
    
    synced_count = 0
    
    # Map submissions by titleSlug to find the earliest accepted submission timestamp
    submission_map = {}
    for sub in submissions:
        slug = sub.get("titleSlug")
        timestamp = int(sub.get("timestamp"))
        dt_solved = datetime.datetime.utcfromtimestamp(timestamp)
        
        if slug not in submission_map or dt_solved < submission_map[slug]:
            submission_map[slug] = dt_solved
            
    # Match pending records
    for record in pending_records:
        problem = record.problem
        slug = problem.title_slug
        
        if slug in submission_map:
            solved_at_time = submission_map[slug]
            assignment = Assignment.query.get(problem.assignment_id)
            
            # Compare with assignment deadline
            if solved_at_time <= assignment.deadline:
                record.status = 'ON_TIME'
            else:
                record.status = 'LATE'
                
            record.solved_at = solved_at_time
            synced_count += 1
            
    # Also sync global LeetCode stats for the leaderboard cache
    stats = fetch_leetcode_user_profile(student.leetcode_username)
    if stats:
        student.lc_total_solved  = stats.get('all', 0)
        student.lc_easy_solved   = stats.get('easy', 0)
        student.lc_medium_solved = stats.get('medium', 0)
        student.lc_hard_solved   = stats.get('hard', 0)

    student.last_synced_at = datetime.datetime.utcnow()
    db.session.commit()
    
    print(f"[WORKER TRACKER] ✅ SUCCESS! Saved {synced_count} new submissions for {student.leetcode_username} to Neon Database.\n")
        
    return f"Synced {synced_count} problems for {student.leetcode_username}"

# Trigger sync for all students in all active assignments
@shared_task(name='tasks.sync_all_active_students_task')
def sync_all_active_students_task():
    print(f"\n[CRON TRACKER] ⏰ Woke up! Finding students to sync...")
    students = User.query.filter(User.role == 'STUDENT', User.leetcode_username != None).all()
    print(f"[CRON TRACKER] Found {len(students)} active students. Dropping them into the Redis queue...")
    for student in students:
        # Push each student into the Celery queue to be processed by workers in parallel!
        sync_student_progress_task.delay(student.id)
            
    print(f"[CRON TRACKER] ✅ Successfully queued {len(students)} students! Going back to sleep.\n")
    return f"Queued {len(students)} students for background syncing."

# Fetch LeetCode problem details (title, difficulty, questionId) by slug
def fetch_leetcode_problem_details(title_slug):
    url = "https://leetcode.com/graphql"
    query = """
    query questionTitle($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        title
        difficulty
      }
    }
    """
    payload = {
        "query": query,
        "variables": {
            "titleSlug": title_slug
        }
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            data = response.json().get("data", {}).get("question")
            if data:
                return {
                    "problem_id": data.get("questionId"),
                    "title": data.get("title"),
                    "difficulty": data.get("difficulty")
                }
        return None
    except Exception as e:
        print(f"Error fetching problem details for {title_slug}: {str(e)}")
        return None

# Fetch LeetCode user statistics (Easy, Medium, Hard, and Total Solved)
def fetch_leetcode_user_profile(username):
    url = "https://leetcode.com/graphql"
    query = """
    query userProblemsSolved($username: String!) {
      matchedUser(username: $username) {
        submitStats {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
    }
    """
    payload = {
        "query": query,
        "variables": {
            "username": username
        }
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            data = response.json().get("data", {}).get("matchedUser")
            if data:
                stats_list = data.get("submitStats", {}).get("acSubmissionNum", [])
                stats = {}
                for item in stats_list:
                    stats[item.get("difficulty")] = item.get("count")
                return {
                    "all": stats.get("All", 0),
                    "easy": stats.get("Easy", 0),
                    "medium": stats.get("Medium", 0),
                    "hard": stats.get("Hard", 0)
                }
        return None
    except Exception as e:
        print(f"Error fetching user profile stats for {username}: {str(e)}")
        return None
