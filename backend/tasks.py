import requests
import datetime
from models import db, User, StudentProgress, AssignmentProblem, Assignment
import os

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
def sync_student_progress(student_id):
    student = User.query.get(student_id)
    if not student or not student.leetcode_username:
        return 0
    
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
            
    student.last_synced_at = datetime.datetime.utcnow()
    db.session.commit()
        
    return synced_count

# Trigger sync for all students in all active assignments
def sync_all_active_students():
    students = User.query.filter(User.role == 'STUDENT', User.leetcode_username != None).all()
    total_synced = 0
    for student in students:
        try:
            synced = sync_student_progress(student.id)
            total_synced += synced
        except Exception as e:
            print(f"Error syncing student {student.username}: {str(e)}")
    return total_synced
