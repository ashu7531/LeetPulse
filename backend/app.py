from flask import Flask, request, jsonify
from flask_cors import CORS
from models import db, User, Batch, Assignment, AssignmentProblem, StudentProgress
from tasks import sync_student_progress, send_email_via_resend, fetch_leetcode_problem_details
import jwt
import datetime
import os
from functools import wraps

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-key-leettrack")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/leettrack")

# Handle ElephantSQL/Neon PostgreSQL scheme compatibility if needed
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

# Ensure tables are created on startup (runs under gunicorn and direct execution)
with app.app_context():
    try:
        db.create_all()
    except Exception as e:
        db.session.rollback()
        app.logger.warning(f"Database tables check/creation warning: {str(e)}")

# Helper: JWT Decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({"message": "Token is missing!"}), 401
        
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            current_user = User.query.get(data["user_id"])
            if not current_user:
                return jsonify({"message": "User not found!"}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token has expired!"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Invalid token!"}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated

# Helper: Role verification
def roles_allowed(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(current_user, *args, **kwargs):
            if current_user.role not in roles:
                return jsonify({"message": "Access denied! Insufficient permissions."}), 403
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator

# --- AUTH ENDPOINTS ---

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role", "STUDENT").upper()
    leetcode_username = data.get("leetcode_username")

    if not username or not email or not password:
        return jsonify({"message": "Missing required fields!"}), 400

    if role not in ["TEACHER", "STUDENT"]:
        return jsonify({"message": "Invalid role!"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "User with this email already exists!"}), 409

    if User.query.filter_by(username=username).first():
        return jsonify({"message": "Username already taken!"}), 409

    new_user = User(
        username=username,
        email=email,
        role=role,
        leetcode_username=leetcode_username
    )
    new_user.set_password(password)

    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "User registered successfully!"}), 201

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"message": "Missing email or password!"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"message": "Invalid credentials!"}), 401

    # Generate JWT Token
    token = jwt.encode(
        {
            "user_id": user.id,
            "role": user.role,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
        },
        JWT_SECRET,
        algorithm="HS256"
    )

    return jsonify({
        "token": token,
        "user": user.to_dict()
    }), 200

@app.route("/api/auth/me", methods=["GET"])
@token_required
def get_me(current_user):
    return jsonify(current_user.to_dict()), 200

# --- TEACHER ENDPOINTS ---

@app.route("/api/teacher/batches", methods=["GET"])
@token_required
@roles_allowed("TEACHER")
def get_batches(current_user):
    batches = Batch.query.filter_by(teacher_id=current_user.id).all()
    return jsonify([batch.to_dict() for batch in batches]), 200

@app.route("/api/teacher/batches", methods=["POST"])
@token_required
@roles_allowed("TEACHER")
def create_batch(current_user):
    data = request.get_json()
    name = data.get("name")
    description = data.get("description")

    if not name:
        return jsonify({"message": "Batch name is required!"}), 400

    new_batch = Batch(
        name=name,
        description=description,
        teacher_id=current_user.id
    )
    db.session.add(new_batch)
    db.session.commit()

    return jsonify(new_batch.to_dict()), 201

@app.route("/api/teacher/batches/<int:batch_id>/students", methods=["GET"])
@token_required
@roles_allowed("TEACHER")
def get_batch_students(current_user, batch_id):
    batch = Batch.query.filter_by(id=batch_id, teacher_id=current_user.id).first()
    if not batch:
        return jsonify({"message": "Batch not found!"}), 404
        
    students = [student.to_dict() for student in batch.students]
    return jsonify(students), 200

@app.route("/api/teacher/batches/<int:batch_id>/students", methods=["POST"])
@token_required
@roles_allowed("TEACHER")
def add_student_to_batch(current_user, batch_id):
    batch = Batch.query.filter_by(id=batch_id, teacher_id=current_user.id).first()
    if not batch:
        return jsonify({"message": "Batch not found!"}), 404

    data = request.get_json()
    email = data.get("email")

    student = User.query.filter_by(email=email, role="STUDENT").first()
    if not student:
        return jsonify({"message": "Student with this email not found! Make sure they register first."}), 404

    if student in batch.students:
        return jsonify({"message": "Student is already in this batch!"}), 400

    batch.students.append(student)
    db.session.commit()

    # Trigger welcome email (non-blocking notification)
    email_body = f"""
    <h3>Welcome to Batch: {batch.name}!</h3>
    <p>Hello {student.username},</p>
    <p>Your teacher, {current_user.username}, has enrolled you in the batch: <b>{batch.name}</b>.</p>
    <p>Log in to LeetTrack to view your LeetCode assignments and monitor deadlines.</p>
    <br>
    <p>Best regards,<br>LeetTrack Team</p>
    """
    send_email_via_resend(student.email, f"Enrolled in Batch: {batch.name}", email_body)

    return jsonify({"message": "Student enrolled successfully!"}), 200

@app.route("/api/teacher/batches/<int:batch_id>/assignments", methods=["GET"])
@token_required
@roles_allowed("TEACHER")
def get_batch_assignments(current_user, batch_id):
    batch = Batch.query.filter_by(id=batch_id, teacher_id=current_user.id).first()
    if not batch:
        return jsonify({"message": "Batch not found!"}), 404
        
    return jsonify([assign.to_dict() for assign in batch.assignments]), 200

@app.route("/api/teacher/batches/<int:batch_id>/assignments", methods=["POST"])
@token_required
@roles_allowed("TEACHER")
def publish_assignment(current_user, batch_id):
    batch = Batch.query.filter_by(id=batch_id, teacher_id=current_user.id).first()
    if not batch:
        return jsonify({"message": "Batch not found!"}), 404

    data = request.get_json()
    title = data.get("title")
    description = data.get("description")
    deadline_str = data.get("deadline")
    problems_data = data.get("problems", [])  # List of {problem_id, title_slug, title, difficulty}

    if not title or not deadline_str or not problems_data:
        return jsonify({"message": "Missing assignment fields or problems list!"}), 400

    try:
        deadline = datetime.datetime.fromisoformat(deadline_str)
    except ValueError:
        return jsonify({"message": "Invalid date format for deadline!"}), 400

    # Create assignment
    new_assignment = Assignment(
        title=title,
        description=description,
        batch_id=batch_id,
        deadline=deadline
    )
    db.session.add(new_assignment)
    db.session.flush()  # populate ID

    # Create problems and map progress records
    for prob in problems_data:
        new_prob = AssignmentProblem(
            assignment_id=new_assignment.id,
            problem_id=prob.get("problem_id"),
            title_slug=prob.get("title_slug"),
            title=prob.get("title"),
            difficulty=prob.get("difficulty")
        )
        db.session.add(new_prob)
        db.session.flush()

        # Initialize student progress records for all students in the batch
        for student in batch.students:
            progress = StudentProgress(
                student_id=student.id,
                assignment_problem_id=new_prob.id,
                status="PENDING"
            )
            db.session.add(progress)

    db.session.commit()

    # Email all students enrolled in the batch
    for student in batch.students:
        email_body = f"""
        <h3>New Assignment Published: {title}</h3>
        <p>Hello {student.username},</p>
        <p>A new LeetCode assignment has been assigned to your batch: <b>{batch.name}</b>.</p>
        <p><b>Deadline:</b> {deadline.strftime('%B %d, %Y at %I:%M %p')}</p>
        <p>Ensure you link your LeetCode profile to automatically sync your progress.</p>
        <br>
        <a href="https://leetcode.com">Open LeetCode</a>
        <br><br>
        <p>Best regards,<br>LeetTrack Team</p>
        """
        send_email_via_resend(student.email, f"New Assignment: {title}", email_body)

    return jsonify(new_assignment.to_dict()), 201

@app.route("/api/teacher/assignments/<int:assignment_id>/progress", methods=["GET"])
@token_required
@roles_allowed("TEACHER")
def get_assignment_progress(current_user, assignment_id):
    assignment = Assignment.query.get(assignment_id)
    if not assignment:
        return jsonify({"message": "Assignment not found!"}), 404
        
    batch = Batch.query.filter_by(id=assignment.batch_id, teacher_id=current_user.id).first()
    if not batch:
        return jsonify({"message": "Access denied!"}), 403
        
    problems = [prob.to_dict() for prob in assignment.problems]
    
    student_progress = []
    for student in batch.students:
        progress_dict = {}
        for prob in assignment.problems:
            record = StudentProgress.query.filter_by(
                student_id=student.id,
                assignment_problem_id=prob.id
            ).first()
            if record:
                progress_dict[prob.id] = {
                    "status": record.status,
                    "solved_at": record.solved_at.isoformat() if record.solved_at else None
                }
            else:
                progress_dict[prob.id] = {
                    "status": "PENDING",
                    "solved_at": None
                }
                
        student_progress.append({
            "student_id": student.id,
            "username": student.username,
            "email": student.email,
            "leetcode_username": student.leetcode_username,
            "progress": progress_dict
        })
        
    return jsonify({
        "assignment": assignment.to_dict(),
        "problems": problems,
        "student_progress": student_progress
    }), 200

@app.route("/api/teacher/problem-details", methods=["GET"])
@token_required
@roles_allowed("TEACHER")
def get_leetcode_problem_details(current_user):
    slug = request.args.get("slug")
    if not slug:
        return jsonify({"message": "Slug parameter is required!"}), 400
        
    slug = slug.strip()
    if "leetcode.com/problems/" in slug:
        import re
        match = re.search(r"leetcode\.com/problems/([^/]+)", slug)
        if match:
            slug = match.group(1)
            
    details = fetch_leetcode_problem_details(slug)
    if not details:
        return jsonify({"message": "Problem not found on LeetCode!"}), 404
        
    return jsonify(details), 200

# Calculate leaderboard rankings for a batch
def get_leaderboard_data(batch_id):
    batch = Batch.query.get(batch_id)
    if not batch:
        return []

    students = batch.students
    leaderboard = []

    for student in students:
        # Get all progress records for this student related to this batch
        records = StudentProgress.query.join(AssignmentProblem).join(Assignment).filter(
            StudentProgress.student_id == student.id,
            Assignment.batch_id == batch_id
        ).all()

        problems_solved_on_time = sum(1 for r in records if r.status == 'ON_TIME')
        problems_solved_late = sum(1 for r in records if r.status == 'LATE')
        total_solved = problems_solved_on_time + problems_solved_late

        leaderboard.append({
            "student_id": student.id,
            "username": student.username,
            "leetcode_username": student.leetcode_username,
            "problems_solved_on_time": problems_solved_on_time,
            "problems_solved_late": problems_solved_late,
            "total_solved": total_solved
        })

    # Sort by total solved desc, then on_time solved desc
    leaderboard.sort(key=lambda x: (-x["total_solved"], -x["problems_solved_on_time"]))

    # Add ranks
    for index, entry in enumerate(leaderboard):
        entry["rank"] = index + 1

    return leaderboard

@app.route("/api/teacher/batches/<int:batch_id>/leaderboard", methods=["GET"])
@token_required
@roles_allowed("TEACHER")
def get_teacher_leaderboard(current_user, batch_id):
    batch = Batch.query.filter_by(id=batch_id, teacher_id=current_user.id).first()
    if not batch:
        return jsonify({"message": "Batch not found!"}), 404

    return jsonify(get_leaderboard_data(batch_id)), 200

# --- STUDENT ENDPOINTS ---

@app.route("/api/student/assignments", methods=["GET"])
@token_required
@roles_allowed("STUDENT")
def get_student_assignments(current_user):
    # Auto-sync check disabled for manual testing as requested
    # if current_user.leetcode_username:
    #     import threading
    #     now = datetime.datetime.utcnow()
    #     needs_sync = False
    #     if not current_user.last_synced_at:
    #         needs_sync = True
    #     else:
    #         diff = now - current_user.last_synced_at
    #         if diff.total_seconds() > 900:  # 15 minutes
    #             needs_sync = True
    #
    #     if needs_sync:
    #         # Run background sync inside Flask application context
    #         def run_sync_in_bg(app_context, user_id):
    #             with app_context:
    #                 try:
    #                     sync_student_progress(user_id)
    #                 except Exception as e:
    #                     print(f"Background auto-sync error for user {user_id}: {str(e)}")
    #         
    #         threading.Thread(
    #             target=run_sync_in_bg,
    #             args=(app.app_context(), current_user.id)
    #         ).start()

    # Student might belong to multiple batches
    batches = current_user.enrolled_batches.all()
    assignments_progress = []

    for batch in batches:
        assignments = Assignment.query.filter_by(batch_id=batch.id).all()
        for assign in assignments:
            # Gather progress records for this assignment's problems
            problems = assign.problems
            problems_progress = []
            for prob in problems:
                progress = StudentProgress.query.filter_by(
                    student_id=current_user.id,
                    assignment_problem_id=prob.id
                ).first()
                
                problems_progress.append({
                    "problem_id": prob.id,
                    "problem_title": prob.title,
                    "problem_difficulty": prob.difficulty,
                    "title_slug": prob.title_slug,
                    "status": progress.status if progress else "PENDING",
                    "solved_at": progress.solved_at.isoformat() if (progress and progress.solved_at) else None
                })
            
            assignments_progress.append({
                "assignment_id": assign.id,
                "title": assign.title,
                "description": assign.description,
                "deadline": assign.deadline.isoformat(),
                "problems": problems_progress
            })

    return jsonify(assignments_progress), 200

@app.route("/api/student/assignments/<int:assignment_id>", methods=["GET"])
@token_required
@roles_allowed("STUDENT")
def get_student_assignment_detail(current_user, assignment_id):
    assign = Assignment.query.get(assignment_id)
    if not assign:
        return jsonify({"message": "Assignment not found!"}), 404

    problems = assign.problems
    problems_progress = []
    for prob in problems:
        progress = StudentProgress.query.filter_by(
            student_id=current_user.id,
            assignment_problem_id=prob.id
        ).first()
        
        problems_progress.append({
            "problem_id": prob.id,
            "problem_title": prob.title,
            "problem_difficulty": prob.difficulty,
            "title_slug": prob.title_slug,
            "status": progress.status if progress else "PENDING",
            "solved_at": progress.solved_at.isoformat() if (progress and progress.solved_at) else None
        })

    return jsonify({
        "assignment_id": assign.id,
        "title": assign.title,
        "description": assign.description,
        "deadline": assign.deadline.isoformat(),
        "problems": problems_progress
    }), 200

@app.route("/api/student/link-leetcode", methods=["POST"])
@token_required
@roles_allowed("STUDENT")
def link_leetcode(current_user):
    data = request.get_json()
    leetcode_username = data.get("leetcode_username")

    if not leetcode_username:
        return jsonify({"message": "LeetCode username is required!"}), 400

    current_user.leetcode_username = leetcode_username
    db.session.commit()

    return jsonify({
        "message": "LeetCode profile linked successfully!",
        "user": current_user.to_dict()
    }), 200

@app.route("/api/student/sync-progress", methods=["POST"])
@token_required
@roles_allowed("STUDENT")
def trigger_student_sync(current_user):
    if not current_user.leetcode_username:
        return jsonify({"message": "Please link your LeetCode username first!"}), 400

    try:
        synced_count = sync_student_progress(current_user.id)
        return jsonify({
            "message": "Progress synchronization completed!",
            "synced_count": synced_count
        }), 200
    except Exception as e:
        return jsonify({"message": f"Synchronization error: {str(e)}"}), 500

@app.route("/api/student/leaderboard", methods=["GET"])
@token_required
@roles_allowed("STUDENT")
def get_student_leaderboard(current_user):
    batches = current_user.enrolled_batches.all()
    if not batches:
        return jsonify([]), 200

    # Return leaderboard of the first enrolled batch for simplicity
    first_batch_id = batches[0].id
    return jsonify(get_leaderboard_data(first_batch_id)), 200

# --- APP STARTUP & HEALTH ---

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "leettrack-backend"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
